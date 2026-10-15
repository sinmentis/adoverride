# ADOverride guide

**Your Azure DevOps. Your way.**

**A Chrome extension for personal Azure DevOps Boards and work item layouts.**

Make Azure Boards use the screen space you have. Hide optional ticket fields,
arrange native cards, and keep your own preferences without changing the team's
process or saving work items. Built with WXT, React, TypeScript, and GitHub Primer.

## Features

| Boards | Work items |
| --- | --- |
| Equal-width Kanban columns | Searchable page, card, and field visibility |
| Compact headers and optional compact cards | Workspace with a reading lane and Properties rail |
| Individual card-field visibility | Drag native cards without replacing editors |
| Automatic native **Show more items** loading | Layout lock and one-step Undo |
| Per-board, project, organization, or global settings | Standalone tickets and tickets opened from a Board |

Both areas support local presets, light/dark popup themes, and configuration
export/import with a preview and pre-import backup. Native values, drafts, Save
and Close controls, filters, and drag handlers remain owned by Azure DevOps.

## The kiwifruit preset

**kiwifruit** is the only built-in preset in Library and Ticket. New installations
and **Reset all** use it. Each area's preset changes only that area.

| Board setting | Default |
| --- | --- |
| Equal-width columns | On |
| Compact header | On |
| Compact cards | Off |
| Auto-load all items | On |
| Card fields | All visible |

Ticket kiwifruit enables Workspace with a saved card arrangement for the
Details page, and hides optional cards and fields from common User Story and Bug
forms. Missing fields or groups are simply absent; unknown content stays native.
Existing installs keep their current Ticket setup. Pick kiwifruit from the preset
menu to switch to it. You can change every supported
setting and save new personal presets.

**Upgrading to 0.11.0:** old built-ins and previously saved templates are retired.
Your active Board settings, Ticket layouts, visibility, lock, theme, and Undo
content are retained. A retained setup that differs from kiwifruit shows
**Custom**. Old configuration imports use the same cleanup. Newly saved presets
in the current format survive restart and export/import.

## Install in Chrome

### From a release package

1. Extract the Chrome extension ZIP into a permanent folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked**, then select the extracted folder containing
   `manifest.json`.
4. Pin **ADOverride** and open an Azure DevOps Board or work item.

Use the same folder for updates so Chrome retains the extension identity and
settings. Save drafts, click **Reload** on the extension card, then refresh ADO.
The popup header shows the installed version. Release packages are prepared
with `npm run zip`; publication is a separate step.

### From source

Use Node.js 22.12 or newer.

```sh
npm ci
npm run build
```

Load `.output/chrome-mv3` using the same Chrome steps above.

## Personalize your Board

Open the extension's **Library** tab. The scope menu next to the preset chooses
where changes are saved. **Board layout** holds the Board switches, and
**Card fields** holds card field visibility; its number counts hidden fields.
Runtime precedence is Board, project, organization, then All ADO. A narrower
profile overrides the broader one; filters do not create new Board scopes.

**Equal-width columns** releases the verified native width cap without shrinking
native minimums. Collapsed columns retain their controls and width. Narrow
windows keep native horizontal scrolling.

**Card fields** controls Assignee, State, Tags, Story Points, and child/link
counts. Active inline editors and focused controls remain usable. There is no extension-managed column collapse or replay.

**Auto-load all items** activates native loading controls in expanded columns
under the current filters. It is on in kiwifruit. Turn it off for large Boards
if loading becomes slow. Loads run serially and pause during dragging, dialogs,
and inactive pages. A stalled load stops with a warning and explicit Retry.
Native/server limits still apply; loaded counts are not a server-side total.

## Personalize a Ticket

The popup selects **Ticket** over an active native editor. Ticket settings are
global across the browser profile and every Ticket type. Next to the preset are
two icon buttons: **Undo** reverts the last Ticket change, and **Lock** removes
the on-page hand and Hide controls while keeping saved presentation active.

**Layout** picks the view, **Original** or **Workspace** (reading lane and
Properties rail). Each view keeps its own card positions. **Reset positions**
clears positions for the active view only.

**Cards & fields** lists pages, cards and fields with their switches. Search to
filter, and use **Show all** to restore visibility. The number on the tab counts
hidden items on this Ticket. Hiding a parent keeps its children's choices.

Hover or focus a mapped card header to use the hand and Hide controls. Dragging
changes visual placement, not native editor nodes or parents. Escape cancels.

The master switch temporarily restores native presentation without deleting
preferences. Native navigation and validation can temporarily protect content
that must remain reachable.

## Privacy and permissions

Settings stay in Chrome's local extension storage. There is no backend,
telemetry, personal access token, or extension-owned work-item update.
The ADOverride rename keeps the existing storage and configuration-format
identifiers, so stored settings, backups, and earlier exports still work.

| Permission | Purpose |
| --- | --- |
| `storage` | Local settings, presets, and configuration backup |
| `activeTab` | Identify the page being customized |
| `scripting` | Connect the controller to an already-open ADO tab |
| ADO host access | Local presentation and authenticated, read-only form-layout metadata |

Host access is limited to `https://dev.azure.com/*` and
`https://*.visualstudio.com/*`. The extension reads project/process/type/layout
metadata, not ticket documents, revisions, or attachments. Automatic loading
uses ADO's own control and normal read requests, including read-only query POSTs.

Configuration files can contain preset names, structural schema keys, and
organization/project/Board scope identifiers. Review them before sharing.
Diagnostics are opt-in and local. Never attach credentials, ticket content,
full page HTML, or an unreviewed report to a public issue.

## Compatibility and troubleshooting

Chrome with Manifest V3 is the release target. Both modern and legacy ADO hosts
are supported. Board adaptation targets verified Kanban structures, not every
split-column, swimlane, Backlog, Query, or sprint layout. Some field/header
matching requires English native labels. Custom or cross-origin contribution
internals may remain unsupported.

ADO's native structure can change. Unknown layouts stay native with a notice;
synthetic browser tests are not proof of every organization's compatibility.
The toolbar is blue on supported enabled pages and gray elsewhere.

If a change does not apply, refresh ADO and check Chrome's site-access setting.
**Inspection details** provides aggregate diagnostics and bounded structural
layout downloads. Ticket reports made before 0.5.1 can contain incorrect
content-derived labels; regenerate and review them before sharing.

## Development and contributions

```sh
npm run dev
npm run compile
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run zip
```

Browser tests load the production extension against fictional native-style
fixtures. No ADO account is needed. Verify the exact behavior, preserve native
editors and drafts, and keep unknown layouts safe. Do not add telemetry or
automatic work-item writes.

Release guard tests also use Git, `zip`, and `unzip`. See the
[tag-release workflow](publishing.md#ci-and-manual-tag-releases) for the shared
validation and publication contract.

The page adapters live in `lib/board-*` and `lib/ticket-*`. The compact Primer UI
is in `entrypoints/popup`. Preferences, migrations, and portable configuration
are handled by `lib/preferences.ts`, `lib/extension.ts`, and `lib/configuration.ts`.

See [publishing notes](publishing.md) for repository metadata, search
keywords, release packaging, and the social preview.

## License

[MIT](../LICENSE). Release packages include separate third-party notices for the
popup and content bundles. This project is not affiliated with or endorsed by
Microsoft or GitHub.
