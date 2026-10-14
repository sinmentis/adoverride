# Publishing ADOverride

## GitHub discoverability

Repository: [sinmentis/adoverride](https://github.com/sinmentis/adoverride).
Visibility remains private until public publication is explicitly approved.

**Tagline**

> Your Azure DevOps. Your way.

**Description**

> Chrome extension for personal Azure DevOps Boards and work item layouts. Equal-width columns, compact headers, Ticket Workspace, and local presets.

**Topics**

`azure-devops`, `azure-boards`, `chrome-extension`, `browser-extension`, `kanban`,
`work-items`, `ui-customization`, `wxt`, `react`, `typescript`

The README title and introduction describe the implemented product in ordinary
search terms. Keep feature claims specific. Do not advertise saved filter views,
personal highlight rules, server-wide changes, or other research-only ideas.

GitHub repository metadata and the social preview must be set after creating the
repository. Preparing these files does not create or publish a public repository.
Choose the repository owner explicitly before uploading source.

## Chrome Web Store copy

**Name**

> ADOverride - Azure DevOps Boards & Work Items

**Short description**

> Personal Azure DevOps Boards and work item layouts, compact cards, and local presets. Your Azure DevOps. Your way.

**Overview**

ADOverride gives you a personal view of Azure DevOps without changing your
team's process. Fill Kanban Boards with equal-width columns, reduce header
spacing, choose visible card fields, and load native batches automatically.

Use Ticket Workspace for a reading lane and Properties rail. Hide optional
fields, arrange native cards, lock your layout, and undo your last Ticket
presentation change. Save local presets or transfer settings with a previewed
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
- Use fictional fixture screenshots for a public listing. Never use private
  tickets, people, organization URLs, or an authenticated browser profile.

## Release checklist

1. Run compile, unit tests, production build, and installed-browser tests.
2. Run `npm run zip`. Inspect the Chrome ZIP and optional source ZIP before
   publishing. Confirm the manifest version, LICENSE, and third-party notices.
3. Keep permissions limited to local storage, the active tab, script injection,
   and the two supported ADO host patterns.
4. Exclude local reports, configuration exports, browser profiles, recordings,
   credentials, dependencies, and build caches from source control.
5. Create the repository only after confirming its owner and public visibility.
   Apply the description/topics and upload the social preview through repository
   settings. Create a versioned release with the Chrome ZIP.

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
