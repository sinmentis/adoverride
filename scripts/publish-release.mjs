import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkArtifact, checkLiveTag, checkTag, command } from './release-check.mjs';

export function releaseNotes(repository, commit) {
  return `Extract the Chrome ZIP and use **Load unpacked** in \`chrome://extensions\` with Developer mode enabled.

[Installation guide](https://github.com/${repository}/blob/${commit}/README.md#install)

Built from commit \`${commit}\`.`;
}

export function publishRelease({ cwd = process.cwd(), tag, commit, repository, run = command }) {
  assert.match(repository ?? '', /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Missing or invalid GitHub repository.');
  const metadata = checkTag({ cwd, tag, commit });
  const directory = path.join(cwd, 'release');
  checkArtifact(directory, metadata);
  checkLiveTag({ cwd, ...metadata }, run);
  const gh = args => run('gh', args[0] === 'api' ? args : [...args, '--repo', repository], { cwd });
  const notes = releaseNotes(repository, metadata.commit);
  const title = `ADOverride ${tag}`;
  const verifyRelease = release => {
    assert.equal(release.tag_name, tag, 'Existing release uses another tag.');
    assert.equal(release.body, notes, 'Refusing to modify a release not created by this workflow.');
    assert.equal(release.name, title, 'Unexpected existing release title.');
    assert.equal(release.prerelease, false, 'Stable tags cannot resume a prerelease.');
  };
  const verifyAssets = release => {
    assert.deepEqual(release.assets.map(asset => asset.name).toSorted(), [metadata.filename, 'SHA256SUMS'].toSorted(), 'Published release has incomplete or unexpected assets.');
    assert.ok(release.assets.every(asset => asset.state === 'uploaded' && asset.size > 0), 'Published release has unfinished assets.');
  };
  let existing;
  try {
    existing = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`]));
  } catch (error) {
    if (!String(error.stderr).includes('(HTTP 404)')) throw error;
  }
  if (existing) {
    verifyRelease(existing);
    if (!existing.draft) {
      verifyAssets(existing);
      console.log(`Release ${tag} is already published. Existing assets are unchanged.`);
      return;
    }
  } else {
    gh(['release', 'create', tag, '--draft', '--verify-tag', '--target', metadata.commit, '--title', title, '--notes', notes]);
  }
  gh(['release', 'upload', tag, path.join(directory, metadata.filename), path.join(directory, 'SHA256SUMS'), '--clobber']);
  checkLiveTag({ cwd, ...metadata }, run);
  gh(['release', 'edit', tag, '--draft=false', '--verify-tag']);
  const published = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`]));
  verifyRelease(published);
  assert.equal(published.draft, false, 'GitHub did not publish the release.');
  verifyAssets(published);
  console.log(`Published ${tag} with the verified Chrome ZIP and SHA256SUMS.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishRelease({ tag: process.env.RELEASE_TAG, commit: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY });
}
