import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)';
const STABLE_VERSION = new RegExp(`^${VERSION}$`);
const STABLE_TAG = new RegExp(`^v${VERSION}$`);
export const REQUIRED_FILES = [
  'manifest.json', 'popup.html', 'background.js', 'content-scripts/content.js',
  'LICENSE', 'README.md', 'PRIVACY.md', 'THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES-CONTENT.txt',
  'docs/guide.md', 'docs/publishing.md', 'docs/chrome-web-store.md',
  'docs/images/board-before-after.png', 'docs/images/board-hero.png', 'docs/images/ticket-before-after.png', 'docs/images/popup.png',
  'docs/store/LISTING.txt', 'docs/store/START-HERE.txt',
];
const DOCUMENTATION = new Set([
  ...REQUIRED_FILES.filter(file => file.startsWith('docs/')),
  'docs/images/social-preview.svg', 'docs/images/social-preview.png',
]);
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
export const command = (program, args, options = {}) =>
  execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, ...options });

export function versionMetadata(cwd = process.cwd()) {
  const pkg = json(path.join(cwd, 'package.json'));
  const lock = json(path.join(cwd, 'package-lock.json'));
  assert.equal(pkg.name, 'adoverride', 'Unexpected release package name.');
  assert.equal(typeof pkg.version, 'string', 'Missing package version.');
  assert.match(pkg.version, STABLE_VERSION, 'Use a stable three-part version.');
  assert.equal(lock.name, pkg.name, 'Lockfile package name does not match.');
  assert.equal(lock.version, pkg.version, 'Lockfile version does not match.');
  assert.equal(lock.packages?.['']?.name, pkg.name, 'Lockfile root package name does not match.');
  assert.equal(lock.packages?.['']?.version, pkg.version, 'Lockfile root version does not match.');
  return { version: pkg.version, filename: `adoverride-${pkg.version}-chrome.zip` };
}

export function checkTag({ cwd = process.cwd(), tag, commit }) {
  const metadata = versionMetadata(cwd);
  assert.equal(typeof tag, 'string', 'Missing release tag.');
  assert.match(tag, STABLE_TAG, 'Release tags must use vX.Y.Z without prerelease suffixes.');
  assert.equal(tag, `v${metadata.version}`, 'Tag and package version do not match.');
  assert.match(commit ?? '', /^[0-9a-f]{40}$/, 'Missing or invalid release commit.');
  const git = args => command('git', args, { cwd }).trim();
  const source = spawnSync('git', ['rev-parse', '--verify', `${commit}^{commit}`], { cwd, encoding: 'utf8' });
  if (source.error) throw source.error;
  assert.equal(source.status, 0, 'Missing triggering commit object.');
  const sourceCommit = source.stdout.trim();
  assert.equal(git(['rev-parse', 'HEAD']), sourceCommit, 'Checkout is not the triggering commit.');
  assert.equal(git(['rev-parse', `refs/tags/${tag}^{commit}`]), sourceCommit, 'Tag does not point to the triggering commit.');
  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', sourceCommit, 'refs/remotes/origin/main'], { cwd, encoding: 'utf8' });
  if (ancestry.error) throw ancestry.error;
  assert.equal(ancestry.status, 0, `The tag must point to a commit on main. ${ancestry.stderr.trim()}`);
  return { ...metadata, tag, commit: sourceCommit };
}

export function checkLiveTag({ cwd = process.cwd(), tag, commit }, run = command) {
  const reference = `refs/tags/${tag}`;
  const refs = new Map(run('git', ['ls-remote', '--exit-code', 'origin', reference, `${reference}^{}`], { cwd })
    .trim().split('\n').map(line => line.split('\t').reverse()));
  assert.equal(refs.get(`${reference}^{}`) ?? refs.get(reference), commit, 'The remote release tag was removed or moved during validation.');
}

export function validateManifest(manifest, version) {
  assert.equal(manifest.manifest_version, 3, 'Only the Chrome Manifest V3 package can be released.');
  assert.equal(manifest.version, version, 'Manifest and package version do not match.');
  assert.equal(manifest.name, 'ADOverride - Customize Azure DevOps', 'Unexpected extension name.');
  assert.deepEqual(manifest.permissions?.toSorted(), ['activeTab', 'scripting', 'storage'], 'Unexpected extension permissions.');
  assert.deepEqual(manifest.host_permissions?.toSorted(), ['https://*.visualstudio.com/*', 'https://dev.azure.com/*'], 'Unexpected host permissions.');
  assert.ok(!manifest.optional_permissions?.length && !manifest.optional_host_permissions?.length, 'Unexpected optional permissions.');
}

export function validateMembers(entries) {
  const files = entries.filter(entry => !entry.endsWith('/'));
  const directories = new Set(['assets/', 'chunks/', 'content-scripts/', 'icon/', 'icon-gray/', 'docs/', 'docs/images/', 'docs/store/']);
  assert.equal(new Set(entries).size, entries.length, 'Duplicate archive members.');
  for (const entry of entries) {
    assert.ok(entry && !entry.startsWith('/') && !entry.includes('\\') &&
      entry.split('/').every(part => part !== '..' && part !== '.'), `Unsafe archive member: ${entry}`);
    if (entry.endsWith('/')) assert.ok(directories.has(entry), `Unexpected archive directory: ${entry}`);
  }
  for (const file of files) {
    assert.ok(REQUIRED_FILES.includes(file) || DOCUMENTATION.has(file) ||
      /^(?:assets|chunks)\/[a-zA-Z0-9_.-]+\.(?:js|css|png|svg|woff2?|ttf)$/.test(file) ||
      /^(?:icon|icon-gray)\/(?:16|32|48|96|128)\.png$/.test(file) ||
      file === 'content-scripts/content.css', `Unexpected release file: ${file}`);
  }
  for (const file of REQUIRED_FILES) assert.ok(files.includes(file), `Missing required release file: ${file}`);
  return files.toSorted();
}

function archive(zip, version) {
  const members = validateMembers(command('unzip', ['-Z1', zip]).trim().split(/\r?\n/));
  const read = file => command('unzip', ['-p', zip, file], { encoding: 'buffer' });
  validateManifest(JSON.parse(read('manifest.json').toString('utf8')), version);
  return { members, read };
}

function filesIn(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return filesIn(path.join(directory, entry.name), `${relative}/`);
    assert.ok(entry.isFile(), `Unsupported build entry: ${relative}`);
    return [relative];
  }).toSorted();
}

export function checkPackage(cwd = process.cwd()) {
  const metadata = versionMetadata(cwd);
  const output = path.join(cwd, '.output');
  const build = path.join(output, 'chrome-mv3');
  const zip = path.join(output, metadata.filename);
  validateManifest(json(path.join(build, 'manifest.json')), metadata.version);
  const content = archive(zip, metadata.version);
  assert.deepEqual(content.members, filesIn(build), 'The ZIP must contain exactly the browser-tested build.');
  for (const file of content.members) {
    assert.ok(content.read(file).equals(readFileSync(path.join(build, file))), `ZIP differs from the browser-tested file: ${file}`);
  }
  writeFileSync(path.join(output, 'SHA256SUMS'), `${sha256(zip)}  ${metadata.filename}\n`);
  return metadata;
}

export function checkArtifact(directory, metadata) {
  assert.deepEqual(readdirSync(directory).toSorted(), [metadata.filename, 'SHA256SUMS'].toSorted(), 'Expected only the Chrome ZIP and SHA256SUMS.');
  const zip = path.join(directory, metadata.filename);
  assert.equal(readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8'),
    `${sha256(zip)}  ${metadata.filename}\n`, 'The downloaded release checksum does not match.');
  archive(zip, metadata.version);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert.ok(mode === 'tag' || mode === 'package', 'Use release-check.mjs tag or package.');
  const result = mode === 'tag' ? checkTag({ tag: process.env.RELEASE_TAG, commit: process.env.GITHUB_SHA }) : checkPackage();
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\nzip_name=${result.filename}\n`);
  console.log(`Verified ${mode}: ${result.tag ?? result.filename}`);
}
