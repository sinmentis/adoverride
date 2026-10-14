// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIRED_FILES, checkArtifact, checkLiveTag, checkPackage, checkTag, command,
  validateManifest, validateMembers, versionMetadata,
} from './release-check.mjs';
import { publishRelease, releaseNotes } from './publish-release.mjs';

const VERSION = '0.11.1';
const TAG = `v${VERSION}`;
const REPOSITORY = 'example/adoverride';
const temporary = [];
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true }); });

function fixture() {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'adoverride-release-test-'));
  temporary.push(cwd);
  const write = (file, value) => {
    const target = path.join(cwd, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const pkg = { name: 'adoverride', version: VERSION };
  const lock = { ...pkg, packages: { '': pkg } };
  const manifest = {
    manifest_version: 3, version: VERSION, name: 'ADOverride - Azure DevOps Boards & Work Items',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'],
  };
  write('package.json', pkg);
  write('package-lock.json', lock);
  for (const file of REQUIRED_FILES) write(`.output/chrome-mv3/${file}`, file === 'manifest.json' ? manifest : 'Fictional release fixture.');
  const git = args => command('git', ['-c', `core.hooksPath=${cwd}/no-hooks`, '-c', 'commit.gpgsign=false', ...args], { cwd }).trim();
  git(['init', '--quiet', '--initial-branch=main']);
  git(['config', 'user.name', 'Release fixture']);
  git(['config', 'user.email', 'release-test@example.invalid']);
  git(['add', 'package.json', 'package-lock.json']);
  git(['commit', '--quiet', '-m', 'test: seed release fixture']);
  const commit = git(['rev-parse', 'HEAD']);
  git(['update-ref', 'refs/remotes/origin/main', commit]);
  git(['tag', '--annotate', TAG, '--message', 'Release fixture']);
  const metadata = { version: VERSION, filename: `adoverride-${VERSION}-chrome.zip`, tag: TAG, commit };
  const zip = () => command('zip', ['-q', '-r', path.join(cwd, '.output', metadata.filename), '.'],
    { cwd: path.join(cwd, '.output/chrome-mv3') });
  const artifact = () => {
    zip();
    checkPackage(cwd);
    mkdirSync(path.join(cwd, 'release'));
    for (const file of [metadata.filename, 'SHA256SUMS']) copyFileSync(path.join(cwd, '.output', file), path.join(cwd, 'release', file));
  };
  return { cwd, write, git, pkg, lock, manifest, metadata, zip, artifact };
}

function release(f, draft = false) {
  return {
    target_commitish: 'main', tag_name: TAG, name: `ADOverride ${TAG}`, body: releaseNotes(REPOSITORY, f.metadata.commit),
    prerelease: false, draft, assets: draft ? [] : [f.metadata.filename, 'SHA256SUMS'].map(name => ({ name, state: 'uploaded', size: 100 })),
  };
}

function publisher(f, initial) {
  const calls = [];
  let state = initial;
  const run = (program, args) => {
    calls.push({ program, args });
    if (program === 'git') return `${f.metadata.commit}\trefs/tags/${TAG}^{}\n`;
    expect(program).toBe('gh');
    if (args[0] === 'api') {
      expect(args).not.toContain('--repo');
      if (!state) throw Object.assign(new Error('Release not found'), { stderr: 'gh: Not Found (HTTP 404)' });
      return JSON.stringify(state);
    }
    expect(args.at(-2)).toBe('--repo');
    expect(args.at(-1)).toBe(REPOSITORY);
    if (args[1] === 'create') state = release(f, true);
    else if (args[1] === 'upload') state.assets = release(f).assets;
    else if (args[1] === 'edit') state.draft = false;
    else throw new Error(`Unexpected publication command: ${args.join(' ')}`);
    return '';
  };
  const publish = () => publishRelease({ cwd: f.cwd, tag: TAG, commit: f.metadata.commit, repository: REPOSITORY, run });
  return { calls, run, publish };
}

describe('manual release gates', () => {
  it.each(['0.11.1', 'v0.11.1-beta', 'v0.11.1.0', 'v00.11.1', 'v0.11.1/other'])('rejects a non-stable tag %s', tag => {
    const f = fixture();
    expect(() => checkTag({ cwd: f.cwd, tag, commit: f.metadata.commit })).toThrow(/tag/i);
  });
  it('rejects a version tag that does not match package.json', () => {
    const f = fixture();
    expect(() => checkTag({ cwd: f.cwd, tag: 'v0.11.2', commit: f.metadata.commit })).toThrow('Tag and package version');
  });
  it.each(['top-level', 'root'])('rejects a stale %s lockfile version', target => {
    const f = fixture();
    const lock = structuredClone(f.lock);
    if (target === 'root') lock.packages[''].version = '0.11.0';
    else lock.version = '0.11.0';
    f.write('package-lock.json', lock);
    expect(() => versionMetadata(f.cwd)).toThrow(/Lockfile.*version/);
  });
  it('accepts an annotated tag on main even if main advances after tagging', () => {
    const f = fixture();
    f.write('later.txt', 'Another main commit.');
    f.git(['add', 'later.txt']); f.git(['commit', '--quiet', '-m', 'test: advance main']);
    f.git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    f.git(['checkout', '--quiet', TAG]);
    expect(checkTag({ cwd: f.cwd, tag: TAG, commit: f.metadata.commit })).toEqual(f.metadata);
  });
  it('resolves an annotated tag object to the actual source commit', () => {
    const f = fixture();
    const object = f.git(['rev-parse', `refs/tags/${TAG}`]);
    expect(object).not.toBe(f.metadata.commit);
    expect(checkTag({ cwd: f.cwd, tag: TAG, commit: object })).toEqual(f.metadata);
  });
  it('rejects a tagged commit that has not landed on main', () => {
    const f = fixture();
    f.git(['checkout', '--quiet', '-b', 'feature']);
    f.write('feature.txt', 'Unmerged change.');
    f.git(['add', 'feature.txt']); f.git(['commit', '--quiet', '-m', 'test: add unmerged change']);
    f.git(['tag', '--delete', TAG]); f.git(['tag', TAG]);
    const commit = f.git(['rev-parse', 'HEAD']);
    expect(() => checkTag({ cwd: f.cwd, tag: TAG, commit })).toThrow('commit on main');
  });
  it('rejects a mismatched triggering commit or a moved remote tag', () => {
    const f = fixture();
    const other = '0'.repeat(40);
    expect(() => checkTag({ cwd: f.cwd, tag: TAG, commit: other })).toThrow('triggering commit');
    expect(() => checkLiveTag({ cwd: f.cwd, tag: TAG, commit: f.metadata.commit },
      () => `${other}\trefs/tags/${TAG}\n`)).toThrow('removed or moved');
  });
  it('packages exactly the browser-tested files and checks the downloaded artifact', () => {
    const f = fixture();
    f.artifact();
    expect(checkPackage(f.cwd)).toEqual({ version: VERSION, filename: f.metadata.filename });
    expect(() => checkArtifact(path.join(f.cwd, 'release'), f.metadata)).not.toThrow();
    expect(readFileSync(path.join(f.cwd, '.output/SHA256SUMS'), 'utf8')).toMatch(/^[0-9a-f]{64}  adoverride-0\.11\.1-chrome\.zip\n$/);
  });
  it('rejects a ZIP that differs from the tested build', () => {
    const f = fixture();
    f.zip();
    f.write('.output/chrome-mv3/background.js', 'Untested build.');
    expect(() => checkPackage(f.cwd)).toThrow('ZIP differs from the browser-tested file');
  });
  it('rejects missing packages and mismatched manifest versions', () => {
    const f = fixture();
    expect(() => checkPackage(f.cwd)).toThrow();
    expect(() => validateManifest({ ...f.manifest, version: '0.11.0' }, VERSION)).toThrow('Manifest and package version');
  });
  it.each([
    { permissions: ['storage', 'activeTab', 'scripting', 'cookies'] },
    { host_permissions: ['<all_urls>'] },
    { optional_host_permissions: ['https://example.invalid/*'] },
    { manifest_version: 2 },
  ])('rejects broadened permissions or another browser package: %j', changes => {
    const f = fixture();
    expect(() => validateManifest({ ...f.manifest, ...changes }, VERSION)).toThrow();
  });
  it.each(['../secret.json', '/absolute.js', 'docs/../profile.json', 'browser-profile/', 'adoverride-config.json', 'README.md'])('rejects unsafe, private, or duplicate archive members: %s', entry => {
    expect(() => validateMembers([...REQUIRED_FILES, entry])).toThrow();
  });
  it('rejects an incomplete package or a tampered download checksum', () => {
    expect(() => validateMembers(REQUIRED_FILES.filter(file => file !== 'LICENSE'))).toThrow('Missing required release file');
    const f = fixture();
    f.artifact();
    f.write('release/SHA256SUMS', `${'0'.repeat(64)}  ${f.metadata.filename}\n`);
    expect(() => checkArtifact(path.join(f.cwd, 'release'), f.metadata)).toThrow('checksum does not match');
  });
});

describe('release publication and reruns', () => {
  it('creates a draft, uploads the verified assets, then publishes and verifies it', () => {
    const f = fixture();
    f.artifact();
    const p = publisher(f);
    p.publish();
    expect(p.calls.filter(call => call.program === 'gh' && call.args[0] === 'release').map(call => call.args[1]))
      .toEqual(['create', 'upload', 'edit']);
    expect(p.calls.filter(call => call.program === 'git')).toHaveLength(2);
    expect(p.calls.filter(call => call.args[0] === 'api')).toHaveLength(2);
  });
  it('resumes its own interrupted draft without recreating the release', () => {
    const f = fixture();
    f.artifact();
    const p = publisher(f, release(f, true));
    p.publish();
    expect(p.calls.filter(call => call.args[0] === 'release').map(call => call.args[1])).toEqual(['upload', 'edit']);
  });
  it('leaves an already-published release and its assets unchanged', () => {
    const f = fixture();
    f.artifact();
    const p = publisher(f, release(f));
    p.publish();
    expect(p.calls.some(call => call.args[0] === 'release')).toBe(false);
  });
  it('refuses to resume a foreign draft or silently accept incomplete published assets', () => {
    const f = fixture();
    f.artifact();
    const foreign = publisher(f, { ...release(f, true), body: 'Manually written release.' });
    expect(foreign.publish).toThrow('not created by this workflow');
    expect(foreign.calls.some(call => call.args[0] === 'release')).toBe(false);
    const incomplete = publisher(f, { ...release(f), assets: [] });
    expect(incomplete.publish).toThrow('incomplete or unexpected assets');
  });
  it('does not mistake a GitHub authentication or service error for an absent release', () => {
    const f = fixture();
    f.artifact();
    const p = publisher(f);
    const run = (program, args) => {
      if (program === 'gh') throw Object.assign(new Error('GitHub unavailable'), { stderr: 'gh: Server Error (HTTP 500)' });
      return p.run(program, args);
    };
    expect(() => publishRelease({ cwd: f.cwd, tag: TAG, commit: f.metadata.commit, repository: REPOSITORY, run })).toThrow('GitHub unavailable');
    expect(p.calls.some(call => call.args[0] === 'release')).toBe(false);
  });
  it('does not publish if the tag is moved after draft assets were uploaded', () => {
    const f = fixture();
    f.artifact();
    const p = publisher(f);
    let checks = 0;
    const run = (program, args) => {
      if (program === 'git' && ++checks === 2) return `${'0'.repeat(40)}\trefs/tags/${TAG}\n`;
      return p.run(program, args);
    };
    expect(() => publishRelease({ cwd: f.cwd, tag: TAG, commit: f.metadata.commit, repository: REPOSITORY, run })).toThrow('removed or moved');
    expect(p.calls.some(call => call.args[0] === 'release' && call.args[1] === 'edit')).toBe(false);
  });
});
