# Publishing ADOverride

## GitHub discoverability

Repository: [sinmentis/adoverride](https://github.com/sinmentis/adoverride).
The repository is public. Store submissions remain a separate, manual approval.

**Tagline**

> Your Azure DevOps. Your way.

**Description**

> Chrome extension to declutter Azure DevOps Boards and work items. Hide fields, rearrange cards, Ticket Workspace, equal-width Kanban columns, local presets.

**Topics**

`azure-devops`, `azure-boards`, `chrome-extension`, `browser-extension`, `kanban`,
`work-items`, `ui-customization`, `productivity`, `manifest-v3`, `wxt`, `react`,
`typescript`

The README title and introduction describe the implemented product in ordinary
search terms. Keep feature claims specific. Do not advertise saved filter views,
personal highlight rules, server-wide changes, or other research-only ideas.

Keep GitHub repository metadata and the social preview aligned with the listing.

## Chrome Web Store copy

Use the [submission checklist](chrome-web-store.md) for upload assets, privacy
declarations, permission explanations, and reviewer instructions.

**Name**

> ADOverride - Azure DevOps Boards & Work Items

**Short description**

> Declutter Azure DevOps Boards and work items: hide fields, rearrange cards, wider Kanban columns. Your Azure DevOps. Your way.

**Overview**

ADOverride gives you a personal view of Azure DevOps without changing your
team's process. Fill Kanban Boards with equal-width columns, reduce header
spacing, choose visible card fields, and load native batches automatically.

Everything sits in one small popup. On a work item, Cards & fields turns any
page, card or field on or off, and Layout switches to Ticket Workspace for a
reading lane and Properties rail. Drag native cards, lock your layout, and undo
your last Ticket change. It works on User Stories, Bugs and other types. Save local presets or transfer settings with a previewed
JSON import and a local backup.

The kiwifruit preset starts with equal-width columns, a compact Board header,
automatic item loading, and Ticket Workspace. Compact cards are optional.

Native values, drafts, Save controls, filters, and drag handlers stay intact.
Settings are local. There is no telemetry, personal access token, backend, or
extension-owned work-item update. Read-only form-layout metadata uses the current
ADO session. Supports dev.azure.com and legacy visualstudio.com organizations.
Unknown native layouts remain unchanged with a notice.

## Images

- `docs/images/social-preview.png`: 1280 x 640 GitHub social preview.
- `docs/images/social-preview.svg`: reproducible source artwork.
- Generate the PNG with `npm run media`.
- `docs/images/board-before-after.png` and `docs/images/ticket-before-after.png`
  compare native and customized layouts with the same fictional content.
- `docs/images/popup.png` shows the real popup: Ticket cards & fields, Ticket
  layout and Board layout.
- Generate the comparisons and popup gallery with `npm run build` then
  `npm run screenshots`.
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

To release the current `0.11.1` version after CI is green:

```sh
git switch main
git pull --rebase origin main
git tag -a v0.11.1 -m "ADOverride v0.11.1"
git push origin v0.11.1
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

The store needs actual screenshots and its privacy declarations reviewed during
submission. This document is listing copy, not a claim that the extension is
already published or approved.

Review `npm audit` before publishing source. The current candidate has upstream
development-tool advisories in the WXT/Firefox runner dependency chain.
`npm audit --omit=dev` reports no runtime dependency advisories. Avoid
`npm audit fix --force`, which proposes incompatible tool downgrades.

WXT's optional browser-review source ZIP excludes test files by default.
Use the repository for the complete source and test suite; publish the Chrome
ZIP as the installable release artifact.
