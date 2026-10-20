# ADOverride guide

ADOverride changes the layout of Azure DevOps boards, work items, and pull requests in Chrome. You can hide fields, move sections in work items, make board columns wider, and put PR activity, descriptions, and checks in separate tabs. It only changes your view, not work item data or what other people see.

**This guide covers v0.11.18**, including PR support. Chrome Web Store approval is separate from the GitHub release. Check the version on the listing; the older 0.11.10 store package only supports Boards and work items.

## Install in Chrome

1. [Install ADOverride from Chrome Web Store](https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo).
2. Pin the extension and open an Azure DevOps Kanban board, work item, or pull request.
3. Click the extension icon. **Library** has the Board settings, **Ticket** has the work item settings, and **PR** has the pull request settings.

The default preset applies automatically. It widens Board columns, turns on automatic item loading, and switches work items to Workspace. It also hides some fields, including estimates, dates, and severity where matched.

To show hidden fields, use **Ticket > Cards & fields > Show all**. The switch at the top of the popup turns off layout changes and keeps your saved settings.

Chrome updates store installations automatically. Your organization may require approval to install extensions or let them access Azure DevOps.

## Manual install

Use this route for development or a build that is not in the store. You will need to update it manually.

### From a release package

1. Download the Chrome ZIP from [Releases](https://github.com/sinmentis/adoverride/releases) and extract it into a permanent folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked**, then select the extracted folder containing `manifest.json`.
4. Pin **ADOverride** and open an Azure DevOps Board or work item.

Use the same folder for updates so Chrome keeps the extension's settings. Save any drafts, click **Reload** on the extension card, then refresh Azure DevOps. The popup header shows the installed version.

The store and unpacked installs have separate settings. To switch between them, export your settings first, disable the old copy, then import into the new copy. Do not run both copies on the same pages.

### From source

Use Node.js 22.12 or newer.

```sh
npm ci
npm run build
```

Load `.output/chrome-mv3` using the manual Chrome steps above.

## Features

| Boards | Work items |
| --- | --- |
| Equal-width Kanban columns | Searchable page, card, and field visibility |
| Compact headers and optional compact cards | Workspace with a reading lane and Properties rail |
| Individual card-field visibility | Drag native cards without replacing editors |
| Automatic native **Show more items** loading | Layout lock and one-step Undo |
| Per-board, project, organization, or global settings | Standalone tickets and tickets opened from a Board |

Pull request settings split Overview into Activity, Description, and Checks tabs. You can fold passed checks and reviewers who have not voted, start with Active comments, and reduce spacing in the Files tree. See [Tidy a pull request](#tidy-a-pull-request).

Board and Ticket support local presets, light/dark popup themes, and configuration
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
clears positions for the active view only. **Original** does not restore hidden
fields or remove saved card positions. To restore Azure DevOps' card order,
choose Original, then **Reset original positions**.

**Cards & fields** lists pages, cards and fields with their switches. Search to
filter, and use **Show all** to restore visibility. The number on the tab counts
hidden items on this Ticket. Hiding a parent keeps its children's choices.

Hover or focus a mapped card header to use the hand and Hide controls. Dragging
changes visual placement, not native editor nodes or parents. Escape cancels.

The master switch temporarily restores native presentation without deleting
preferences. Native navigation and validation can temporarily protect content
that must remain reachable.

## Tidy a pull request

**Included in v0.11.18.** When upgrading from 0.11.10, PR settings turn on by default. Existing Board and work item settings are kept.

The popup selects **PR** on a pull request page. PR settings are one global
profile; **Reset to kiwifruit** turns every option back on.

| Overview option | What it does |
| --- | --- |
| Split Overview into tabs | Overview becomes **Activity** (the feed at full width), followed by **Description** (with tags and work items) and **Checks** (merge status with reviewers). On those two tabs each block spans the full width, one under another. Checks shows a red **N failed** or **N pending** badge. The last tab you used is remembered; clicking Activity always opens the feed |
| Compact header | Tighter title, tab bar and Files toolbar on every PR tab |
| Hide header avatars | Removes the reviewer avatar strip next to the title; the sidebar Reviewers list stays |
| Merge status in sidebar | When Overview is not split, moves the checks and policies card to the top of the right sidebar; work items are listed before tags. **Expand** widens the card over the left column so long check names fit on one line; **Collapse** puts it back |
| Collapse passed checks | Folds passed policies into an **N passed** button; failing and pending ones stay |
| Collapse silent reviewers | Folds optional reviewers without a vote into **+N with no vote**; required reviewers and anyone who voted stay |
| Fold long description | When Overview is not split, descriptions taller than about 12 lines show a preview with **Show more**; editing always shows the full text |
| Start on active comments | Picks the native **Active comments** activity filter once when a PR opens |
| Fold update runs | Two or more pushes or system events in a row fold behind the first one (**+N more updates**); comments stay in place |
| Compact pushes | Push cards show only "pushed N commits"; **Show commits** opens the commit list |

| Files option | What it does |
| --- | --- |
| Hide comments in file tree | Removes comment-thread rows from the changed-files tree; comments stay in the diff |
| Compact file tree | Halves the indentation and tightens rows so long paths fit |

**Tabs** lists the PR tabs on the page with a switch each, including extension
tabs such as Agency Sessions or Risk Assessment. Hidden tabs are remembered by
their stable id, so they stay hidden on every PR. The tab you are on always
stays visible, so a direct link still works.

**Blocked** lists the comment authors seen on this PR. Block one, or type a
display name, and resolved or closed threads they started fold behind one
**N from blocked authors** button next to the activity filter. Active and
pending threads always stay visible, so nothing that still needs an answer is
hidden. In **Files** their resolved inline threads fold to a one-line button. Matching uses the
display name, case-insensitive, so bot accounts such as review agents can be
blocked by name. The list collects thread authors as they appear while the page
is open, including after you switch the activity filter or scroll; type a name
to block someone who hasn't appeared yet.

kiwifruit turns every option on and hides Updates, Test Results Hub, Agency
Sessions, PR Standard Questionnaire and Risk Assessment, including for installs
that existed before PR support. **Reset to kiwifruit** keeps your blocked
list. The activity filter is a one-time default: if you already picked
another filter, or change it later, ADOverride leaves it alone. ADOverride
never votes, completes, resolves, or comments; it only changes the layout and
opens the native filter menu once. Parts of the page it doesn't recognize keep
the native layout, and the popup names them.

## Privacy and permissions

See the [privacy policy](../PRIVACY.md) for data handling, retention, and deletion.

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

Built with WXT, React, TypeScript, and GitHub Primer.

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

## Upgrade notes

**Upgrading to 0.11.0:** old built-ins and previously saved templates are retired.
Your active Board settings, Ticket layouts, visibility, lock, theme, and Undo
content are retained. A retained setup that differs from kiwifruit shows
**Custom**. Old configuration imports use the same cleanup. Newly saved presets
in the current format survive restart and export/import.

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
