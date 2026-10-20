# Chrome Web Store listing and updates

The [live item](https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo)
currently serves **0.11.10**. The copy in [store/LISTING.txt](store/LISTING.txt)
and the published-version images describe Boards and work items only.
Newer PR features on `main` are not in that package.

No store submission is made by the scripts in this repository.

## 1. Update the existing item

Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
using the publishing account and select ADOverride, item
`ijeoidnjoamdkpfgbnhfajddhpakobjo`. **Do not add a new item.**

For the current presentation-only update, replace the detailed description with
`store/LISTING.txt` and the first screenshot with `store/01-board.jpg`. Keep the
existing package and screenshots 2-5. Confirm the homepage, support, and privacy
links below, save the draft, and follow the dashboard's review/publication steps.
The listing bundle is not an extension ZIP and must not be uploaded as a package.

For a later binary update, use the approved, verified Chrome ZIP from the
matching [GitHub release](https://github.com/sinmentis/adoverride/releases).
Keep existing release artifacts unchanged. A source-code ZIP or the entire
listing-assets folder is not an installable extension package.

## 2. Store listing

| Field | Value |
| --- | --- |
| Name (from manifest) | ADOverride - Azure DevOps Boards & Work Items |
| Language | English |
| Category | Workflow & Planning (the current listing category) |
| Homepage | https://github.com/sinmentis/adoverride |
| Support | https://github.com/sinmentis/adoverride/issues |
| Privacy policy | https://github.com/sinmentis/adoverride/blob/main/PRIVACY.md |
| Store icon | `icon-128.png` |
| Small promotional tile | `promo-440x280.png` |
| Optional marquee | `marquee-1400x560.png` |
| Screenshots, in order | `01-board.jpg` through `05-board-fields.jpg` |

The published 0.11.10 manifest supplies this short description:

```text
Declutter Azure DevOps Boards and work items: hide fields, rearrange cards, wider Kanban columns. Your Azure DevOps. Your way.
```

The title and short description come from the uploaded manifest. They are not
changed by pasting the detailed description. This presentation update keeps
them unchanged. For a future approved package, a clearer proposed summary is
(122 characters, within the 132-character limit):

```text
Hide work item fields, rearrange form sections, and widen Azure DevOps boards. Customize your view, not your team's setup.
```

### Detailed description

Paste the complete contents of [store/LISTING.txt](store/LISTING.txt). That file
is the source of truth for current-store copy; do not paste PR feature text from
the main-branch guide into the current-version listing.

## 3. Privacy practices

### Single purpose

```text
Let users personalize the local presentation of Azure DevOps Boards and work
items by choosing visible content, form arrangements, and display density,
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

The current store lists these categories. Review them against the package
being submitted; do not remove an accurate disclosure to simplify the listing:

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

## 5. Review and publication

Keep the existing public, free listing and distribution settings unless an
intentional change is approved. Complete any account/legal declarations
yourself based on your circumstances.

Save all sections, resolve dashboard errors, then choose **Submit for review**.
Use the dashboard's publication controls to decide when approved changes go
live. Submission and publication are separate from
GitHub releases and are not performed by this repository's tag workflow.

### When a PR-capable package is approved for release

Update the single-purpose text, data-use review, reviewer instructions, and
screenshots to cover the new behavior. Explain that the PR defaults enable
layout changes and hide some tabs, and that blocked authors' active and pending
threads remain visible. Stored author display names must be considered in the
dashboard's current data-use definitions.

Only describe PR support as available through the store once the matching
package is live. Then update the version notices in README, the guide, the
privacy policy, and this checklist together.

## Regenerating images

To regenerate the first screenshot and README hero from the existing
same-content Board comparison, without replacing the remaining gallery:

```sh
node scripts/store-media.mjs
```

To recapture all page/popup images, use an extension build matching the version
you plan to advertise, then:

```sh
npm run build
npm run screenshots
npm run store:assets
```

Do not replace current-store popup images with a newer build's PR controls.

The first screenshot is a labeled 1280x800 before/after composition using the
same fictional Board and viewport, with a PNG copy at `docs/images/board-hero.png`.
The other four 1280x800 JPEGs show fictional fixtures; popup views overlay an
actual popup capture on the corresponding fixture page. The 440x280 promotional
tile and optional 1400x560 marquee are branded illustrations, not screenshots.
The 128x128 listing icon uses the existing 96px icon with transparent padding.

Official references:
[account](https://developer.chrome.com/docs/webstore/set-up-account),
[images](https://developer.chrome.com/docs/webstore/images),
[privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
[publishing](https://developer.chrome.com/docs/webstore/publish).
