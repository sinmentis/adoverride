# Chrome Web Store submission

Submission kit for the published **0.11.10** Chrome package. No store submission
is made by the scripts in this repository.

## 1. Account and package

In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
complete the publisher name, verify the contact email, and enable two-step
verification on the publishing Google account. Complete any identity or trader
status questions yourself based on your circumstances.

Choose **Add new item** and upload `adoverride-0.11.10-chrome.zip` from the
[release](https://github.com/sinmentis/adoverride/releases/tag/v0.11.10).
Upload the extension ZIP, not the source-code archive or the entire materials
folder. Keep the existing release artifact unchanged.

## 2. Store listing

| Field | Value |
| --- | --- |
| Name (from manifest) | ADOverride - Azure DevOps Boards & Work Items |
| Language | English |
| Category | Productivity; choose Workflow & Planning if offered as a subcategory |
| Homepage | https://github.com/sinmentis/adoverride |
| Support | https://github.com/sinmentis/adoverride/issues |
| Privacy policy | https://github.com/sinmentis/adoverride/blob/main/PRIVACY.md |
| Store icon | `icon-128.png` |
| Small promotional tile | `promo-440x280.png` |
| Optional marquee | `marquee-1400x560.png` |
| Screenshots, in order | `01-board.jpg` through `05-board-fields.jpg` |

The manifest supplies this short description:

```text
Declutter Azure DevOps Boards and work items: hide fields, rearrange cards, wider Kanban columns. Your Azure DevOps. Your way.
```

Paste this detailed description:

```text
Make Azure DevOps fit the way you work.

ADOverride gives you a personal layout for Azure DevOps Boards and work items.
Hide clutter, rearrange cards, and give important content more room without
changing your team's process or anyone else's view.

BOARDS
- Fill the available width with equal-width Kanban columns.
- Reduce header spacing and optionally compact cards.
- Choose whether cards show assignees, state, tags, story points, and link counts.
- Automatically load additional native batches under your current filters.

WORK ITEMS
- Show or hide supported pages, cards, and fields.
- Drag cards into your preferred arrangement.
- Switch between the original view and Workspace, with a wide reading area
  and a Properties rail.
- Lock on-page layout controls or undo the last Ticket customization.

YOUR SETTINGS
- Start with the built-in kiwifruit preset or save your own.
- Save Board settings per Board, project, organization, or across Azure DevOps.
- Use shared Ticket preferences across work item types, including User Stories
  and Bugs.
- Export or import your configuration as a local JSON file.

PRIVACY
Settings stay in local extension storage. No analytics, ads, or developer
backend. ADOverride processes page structure and supported-page addresses
locally and reads form-layout metadata from your own Azure DevOps organization
using your existing session. It does not send your work item data to us or
submit work item changes.

GET STARTED
Sign in to Azure DevOps, open a Kanban Board or work item, and open the extension.
Use Library for Board settings and Ticket for work item settings.

COMPATIBILITY
Supports Azure DevOps Services on dev.azure.com and *.visualstudio.com.
Some matching depends on English labels. Custom process layouts and third-party
controls may not be supported; unrecognized content stays unchanged.
Azure DevOps Server on other domains is not supported.

Open source under MIT. Not affiliated with or endorsed by Microsoft or GitHub.
Screenshots use fictional work items and replayed layouts.
```

## 3. Privacy practices

### Single purpose

```text
Let users personalize the local presentation of Azure DevOps Boards and work
items by choosing visible content, card arrangements, and display density,
without changing work item data or the team's process.
```

### Permission justifications

**storage**

```text
Store local presentation settings, scope-specific Board profiles, Ticket
visibility and arrangements, named presets, the last undoable change, and a
pre-import configuration backup. No Chrome Storage Sync is used.
```

**activeTab**

```text
Identify the tab the user is customizing when they open the popup, determine
whether it is a supported Azure DevOps view, and connect the popup's settings
and inspection controls to that tab. Unrelated pages are not customized.
```

**scripting**

```text
Inject the bundled content controller into an already-open Azure DevOps tab
when the controller is missing or outdated after an extension install or
update. Injection is guarded by a supported Azure DevOps URL check and uses
only packaged code.
```

**Host permissions: `https://dev.azure.com/*`, `https://*.visualstudio.com/*`**

```text
Apply saved presentation settings to Azure DevOps pages as they load and read
project/process/type/form-layout metadata from the user's own organization
over HTTPS with their existing session. The legacy visualstudio.com pattern
supports organization-specific Azure DevOps hostnames. Access is not requested
for arbitrary websites. There is no developer backend or work item write API.
```

### Remote code

Select **No, I am not using remote code**. JavaScript, styles, and dependencies
are packaged in the extension. Azure DevOps responses are parsed as metadata,
not downloaded executable code.

### Data-use declarations

Do not equate "no server collection" with "no data handling." Google's
[User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
requires disclosure even for local processing.

Review and select the following categories for the current implementation:

| Category | Why it applies |
| --- | --- |
| Website content | Local processing of rendered ADO structure, schema labels, and work item IDs for presentation and counts |
| Web history | Current supported-page URLs and derived organization/project/Board scope keys; no browsing-history log |
| User activity | User-triggered visibility, layout, and preference changes handled and saved locally; no analytics or general click/keystroke log |

The extension does not extract passwords, cookie values, payment information,
health data, precise location, or private communications for storage or
transmission. Existing session credentials are attached by the browser to
same-origin metadata requests, not read by extension code.

Review the dashboard's current definitions against this behavior before
certifying. The publisher, not an automation script, must confirm the three
limited-use certifications (no unrelated selling/transfers, no unrelated uses,
no creditworthiness/lending uses). Local-only processing and these disclosures
must match the linked privacy policy.

## 4. Reviewer test instructions

Paste these instructions into **Test instructions**:

```text
ADOverride has no separate account or paid features. It requires access to an
Azure DevOps Services organization/project with Azure Boards enabled.

1. Sign in at https://dev.azure.com using a test organization/project. Use an
   English UI and a standard Agile or Scrum process. Create a few fictional
   work items if the Board is empty.
2. Open Boards > Boards, pin ADOverride, and open its popup.
3. In Library > Board layout, toggle Equal-width columns and Compact header.
   The Board should change without modifying work items.
4. In Library > Card fields, toggle Assignee or Tags. Card metadata visibility
   should change without changing the stored values.
5. Open a User Story or Bug. The popup selects Ticket. Expand Details under
   Cards & fields and toggle a supported optional card such as Description.
6. Open Layout and switch between Original and Workspace. Where the native
   layout is supported, Workspace has a reading area and Properties rail.
7. Leave layout controls unlocked to drag a card by its extension handle.
   Undo restores the last Ticket customization. Lock removes on-page controls.
8. Turn off ADOverride using the popup's master switch. Native presentation
   returns; saved preferences remain for the next time it is enabled.

No personal access token is required. The extension is limited to
dev.azure.com and HTTPS *.visualstudio.com sites. Unknown layouts may remain
unchanged. On other websites the popup explains that an ADO page is required.
```

**Access to arrange before submission:** these instructions do not provide a
reviewer account. If the reviewer cannot use their own test organization,
provide access to a separate demo organization containing only fictional data.
Put any reviewer credentials only in the dashboard's private test-instructions
fields. Never use a corporate account or put credentials in this repository.
Do not assume anonymous access to a public GitHub repository enables ADO testing.

The repository's browser tests are supplemental evidence, not a replacement for
reviewer access. They replay fictional Azure DevOps layouts without an ADO login.

## 5. Distribution and submission

Choose free distribution and the regions where you intend to offer the
extension. Select Public for the intended public listing, or Unlisted for a
limited pilot. Complete account/legal declarations yourself.

Save all sections, resolve dashboard errors, then choose **Submit for review**.
For a controlled first launch, turn off automatic publication after approval;
publish manually after approval. Submission and publication are separate from
GitHub releases and are not performed by this repository's tag workflow.

## Regenerating images

```sh
npm run build
npm run store:assets
```

Outputs are in `docs/store/`. Screenshots are full-bleed 1280x800 JPEGs generated
from the production extension and fictional fixtures. Popup views overlay an
actual popup capture on the corresponding fixture page. The 440x280 promotional
tile and optional 1400x560 marquee are branded illustrations, not screenshots.
The 128x128 listing icon uses the existing 96px icon with transparent padding.

Official references:
[account](https://developer.chrome.com/docs/webstore/set-up-account),
[images](https://developer.chrome.com/docs/webstore/images),
[privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
[publishing](https://developer.chrome.com/docs/webstore/publish).
