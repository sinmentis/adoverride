# ADOverride privacy policy

Effective date: October 21, 2026

ADOverride customizes the appearance of Azure DevOps Boards, work items, and
pull requests in your browser. It has no developer-operated backend, analytics, advertising, or
telemetry. The developers do not receive your Azure DevOps data through the
extension.

**Version scope:** this policy covers v0.11.18 and v0.11.19, including pull request features. The icon update in 0.11.19 does not change data handling. The older 0.11.10 store package only customizes Boards and work items and does not perform the PR handling described below.

## Information handled in your browser

- **Page information:** ADOverride processes the current tab address to recognize
  supported Azure DevOps pages and select the appropriate settings. Saved scope
  keys can contain organization, project, and Board identifiers. It does not
  maintain a browsing-history log.
- **Website content:** the extension inspects the rendered page structure,
  card and field labels, visibility, and work item IDs needed to count loaded
  items. It changes presentation without copying ticket bodies, comments,
  attachments, or editor drafts into its settings. On pull request pages it
  reads the rendered page structure (policy status icons, reviewer vote icons,
  file-tree rows) to adjust the layout, and opens the native activity filter
  once to select Active comments. It reads comment author display names to
  match your blocked list and to list authors in the popup, and reads thread
  status to keep active discussions visible. It does not copy pull request
  code, descriptions, or comment text into settings or send them to the
  developer, and never votes,
  completes, or resolves anything. The last Overview tab you used (Activity,
  Description or Checks) is kept in the Azure DevOps site's local storage.
- **Interactions and preferences:** pull request layout options, hidden pull
  request tabs, blocked comment author names, visibility choices, card positions, view
  mode, presets, scope, theme, layout lock, and the last undoable Ticket change
  are stored locally using Chrome's extension storage. Importing settings also
  keeps a local pre-import backup. Settings are not sent to Chrome Storage Sync.

## Connections to Azure DevOps

ADOverride makes HTTPS, read-only requests to your Azure DevOps organization for
project, process, work item type, and form-layout metadata. The browser supplies
your existing Azure DevOps session for these requests. The extension does not
ask for passwords or personal access tokens, or read authentication-cookie
values.

Automatic item loading activates Azure DevOps' native loading controls, which
make normal Azure DevOps requests. Native edits and saves remain Azure DevOps
operations; ADOverride does not submit work item changes.

These connections are limited to `https://dev.azure.com` and HTTPS subdomains of
`visualstudio.com`. Your use of Azure DevOps is also governed by Microsoft's
privacy policy and your organization's policies.

## Exports, diagnostics, and support

Configuration export and diagnostic downloads happen only when you request
them. They are generated locally, not uploaded automatically. Configuration
files can include preset names, structural field keys, saved scope
identifiers, and blocked author names. Layout diagnostics can include schema labels, CSS, and page
structure. Review files before sharing them.

If you choose to post a report on GitHub, that report is shared with GitHub and
its audience under GitHub's terms and privacy policy. Do not include credentials
or private work item content in a public issue.

## Sharing and limited use

ADOverride does not sell user data, use it for advertising, transfer it to data
brokers, or use it for creditworthiness or lending decisions. Data is used only
to provide its visible customization features. Developers do not have remote
access to your stored settings or pages.

ADOverride's use of information complies with the Chrome Web Store User Data
Policy, including its Limited Use requirements.

## Retention and deletion

Local preferences and backups remain in your browser profile until replaced or
removed. Disabling the extension pauses customization but does not delete its
settings. Uninstalling it removes its extension storage; manually exported
files remain wherever you saved them and must be deleted separately. Temporary
page inspection and metadata caches are held in memory.

The last PR Overview tab is saved under
`adoverride.pr.overviewTab` in the Azure DevOps site's local storage. Uninstalling
the extension does not remove this site preference. It can be removed
separately from that site's local storage.

## Contact and changes

For privacy questions, use the
[project's support page](https://github.com/sinmentis/adoverride/issues).
For sensitive security reports, use
[private vulnerability reporting](https://github.com/sinmentis/adoverride/security/advisories/new).

Changes to this policy will be published on this page with an updated effective
date.
