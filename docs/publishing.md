# Publishing ADOverride

## GitHub discoverability

Repository: [sinmentis/adoverride](https://github.com/sinmentis/adoverride).
The repository and [Chrome Web Store item](https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo)
are public. The current store and latest tagged release are **0.11.10**;
`main` is newer. Store submissions remain a separate, manual approval.

**Tagline**

> Customize your Azure DevOps view without changing your team's setup.

**Description**

> Chrome extension for personal Azure DevOps layouts: hide work item fields, rearrange form cards, and widen Kanban columns. No team-process changes.

**Website**

https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo

**Topics**

`azure-devops`, `azure-boards`, `chrome-extension`, `browser-extension`, `kanban`,
`work-items`, `ui-customization`, `productivity`, `manifest-v3`, `wxt`, `react`,
`typescript`

The README title and introduction describe the installable product in ordinary
search terms. Label newer source-only features separately. Keep feature claims
specific. Do not advertise saved filter views,
personal highlight rules, server-wide changes, or other research-only ideas.

Keep GitHub repository metadata and the social preview aligned with the listing.

## Chrome Web Store copy

Use [store/LISTING.txt](store/LISTING.txt) for the current store's detailed
description and the [update checklist](chrome-web-store.md) for assets, privacy
declarations, permission explanations, and reviewer instructions. Edit the
existing item, not a new listing.

**Name**

> ADOverride - Azure DevOps Boards & Work Items

**Short description (current published manifest)**

> Declutter Azure DevOps Boards and work items: hide fields, rearrange cards, wider Kanban columns. Your Azure DevOps. Your way.

The title and summary are package-bound. Changing the detailed description or
images does not change the installed package. Keep PR claims out of the live
listing until a matching release is available there.

## Images

- `docs/images/social-preview.png`: 1280 x 640 GitHub social preview.
- `docs/images/social-preview.svg`: reproducible source artwork.
- Generate the PNG with `npm run media`.
- `docs/images/board-before-after.png` and `docs/images/ticket-before-after.png`
  compare native and customized layouts with the same fictional content.
- `docs/images/board-hero.png` and `docs/store/01-board.jpg` use the same Board
  comparison in a labeled, 1280 x 800 composition. Regenerate with
  `node scripts/store-media.mjs`.
- `docs/images/popup.png` shows the real popup: Ticket cards & fields, Ticket
  layout and Board layout.
- Generate the comparisons and popup gallery with `npm run build` then
  `npm run screenshots`. Use a build matching the version being advertised;
  recapturing with main can expose controls not yet in the store.
- Use fictional fixture screenshots for a public listing. Never use private
  tickets, people, organization URLs, or an authenticated browser profile.

## Release checklist

1. Use the CI pipeline below to compile, test, build the Chrome ZIP, and run
   installed-browser tests against that exact build.
2. Confirm the package version, permissions, LICENSE, and third-party notices.
   The package guard checks archive paths and byte-matches every packaged file.
3. Keep permissions limited to local storage, the active tab, script injection,
   and the two supported ADO host patterns.
4. Exclude local reports, configuration exports, browser profiles, recordings,
   credentials, dependencies, and build caches from source control.
5. Push a version tag only when ready to release. Keep repository visibility
   unchanged; private releases require repository access.
6. Submit the approved package as an update to the existing store item. Once
   it is live, synchronize store copy, README/guide version notices, the privacy
   policy's version scope, GitHub About, and the listing checklist. A GitHub
   release alone does not update Chrome Web Store.

## CI and manual tag releases

| Event | Result |
| --- | --- |
| Pull request or push to `main` | Compile, unit tests, production ZIP, browser tests, package verification, downloadable artifact |
| Manual **Run workflow** | The same validation, without publishing |
| Push a `vX.Y.Z` tag | Validate the tag, run the same pipeline, then publish the verified ZIP and `SHA256SUMS` |

**Pushing a tag is the release approval.** The workflow does not bump versions,
create tags, submit to the Chrome Web Store, or change repository visibility.

Tags must match `package.json`, both lockfile version fields, and the generated
manifest. The tagged commit must be reachable from `main`. It need not remain
the latest commit while validation runs. A removed or moved tag cannot publish.

Build the ZIP **before** browser tests. The archive is compared with every
browser-tested file afterward, then transferred to the release job without a
rebuild. Validation has read-only repository permissions. Only the tag-triggered
publication job can write releases.

After explicit release approval and green CI, replace `X.Y.Z` below with the
verified package version:

```sh
git switch main
git pull --rebase origin main
git tag -a vX.Y.Z -m "ADOverride vX.Y.Z"
git push origin vX.Y.Z
```

For a later release, update both manifests with
`npm version patch --no-git-tag-version`, commit and push those changes to `main`,
then tag the resulting version. Do not force-update a release tag.

Failed validation produces no release. Browser failure artifacts contain only
traces and error context from fictional fixtures, never browser profiles.
Re-running publication resumes only a draft created by this workflow for the
same commit. A completed release is verified and left unchanged. Existing
published assets are never overwritten; use a new version for changes.

For local package checks:

```sh
npm run compile
npm test
npm run zip
npm run test:browser
node scripts/release-check.mjs package
```

The release guards and their tests use Git, `zip`, and `unzip`. These are
available on the Ubuntu CI runner. Review WXT's optional source ZIP separately;
only the validated Chrome ZIP and checksum file are release assets.

The store needs screenshots and privacy declarations matching the submitted
version. Store publication is separate from this repository's release workflow.

Review `npm audit` before publishing source. The current candidate has upstream
development-tool advisories in the WXT/Firefox runner dependency chain.
`npm audit --omit=dev` reports no runtime dependency advisories. Avoid
`npm audit fix --force`, which proposes incompatible tool downgrades.

WXT's optional browser-review source ZIP excludes test files by default.
Use the repository for the complete source and test suite; publish the Chrome
ZIP as the installable release artifact.
