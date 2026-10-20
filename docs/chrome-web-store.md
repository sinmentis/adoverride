# Chrome Web Store listing and updates

This kit is for **0.11.18**, including PR features and the new package title. Update the [existing store item](https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo) with the package, text, and screenshots together. Store approval is separate from the GitHub release.

No store submission is made by the scripts in this repository.

## 1. Update the existing item

Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the publishing account and select ADOverride, item `ijeoidnjoamdkpfgbnhfajddhpakobjo`. **Do not add a new item.**

Upload `adoverride-0.11.18-chrome.zip` from the [v0.11.18 release](https://github.com/sinmentis/adoverride/releases/tag/v0.11.18). Verify it against the release's `SHA256SUMS`. Do not upload a source archive or the outer store-materials ZIP as the extension package.

Replace the detailed description with `store/LISTING.txt` and replace all five screenshots with the files below. Review the new PR data handling, check the links, save, and submit the update. Do not change an already published GitHub release file.

## 2. Store listing

| Field | Value |
| --- | --- |
| Name (from manifest) | ADOverride - Customize Azure DevOps |
| Language | English |
| Category | Workflow & Planning (the current listing category) |
| Homepage | https://github.com/sinmentis/adoverride |
| Support | https://github.com/sinmentis/adoverride/issues |
| Privacy policy | https://github.com/sinmentis/adoverride/blob/main/PRIVACY.md |
| Store icon | `icon-128.png` |
| Small promotional tile | `promo-440x280.png` |
| Optional marquee | `marquee-1400x560.png` |
| Screenshots, in order | `01-board.jpg`, `02-workspace.jpg`, `03-ticket-fields.jpg`, `04-ticket-layout.jpg`, `05-pull-request.jpg` |

The 0.11.18 package supplies this short description (119 characters):

```text
Hide work item fields, widen boards, and organize pull request pages in Azure DevOps. Changes only affect your browser.
```

Check that both the new title and this summary appear after uploading the package.

### Detailed description

Paste all of [store/LISTING.txt](store/LISTING.txt). It describes this package, including PR settings and their defaults.

## 3. Privacy practices

### Single purpose

```text
Change how Azure DevOps Boards, work items, and pull requests look in the user's browser. Users can hide fields, move form sections, choose visible PR tabs, and fold activity without changing work item or PR data.
```

### Permission justifications

**storage**

```text
Save settings in the browser: Board profiles, hidden work item fields, section positions, PR layout options, hidden PR tabs, blocked author display names, presets, the last undoable change, and a backup before importing settings. Chrome Storage Sync is not used.
```

**activeTab**

```text
Check whether the current tab is a supported Azure DevOps page and connect the popup to that page. The extension does not change other websites.
```

**scripting**

```text
Connect the extension to an Azure DevOps tab that was already open when the extension was installed or updated. This uses only code included in the package and only runs on supported Azure DevOps URLs.
```

**Host permissions: `https://dev.azure.com/*`, `https://*.visualstudio.com/*`**

```text
Apply saved settings to Azure DevOps pages and read project, process, work item type, and form-layout information from the user's own organization over HTTPS. Requests use the user's existing sign-in. The visualstudio.com permission supports older Azure DevOps addresses. The extension does not request access to other websites, send data to a developer server, or write to work items.
```

### Remote code

Select **No, I am not using remote code**. JavaScript, styles, and dependencies
are packaged in the extension. Azure DevOps responses are parsed as metadata,
not downloaded executable code.

### Data-use declarations

Do not equate "no server collection" with "no data handling." Google's
[User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
requires disclosure even for local processing.

Keep accurate disclosures from the earlier version and review them against 0.11.18:

| Category | Why it applies |
| --- | --- |
| Website content | Rendered ADO structure, schema labels, work item IDs, PR status icons, author display names, and thread status |
| Web history | Current supported-page URLs and derived organization/project/Board scope keys; no browsing-history log |
| User activity | User-chosen layouts, hidden tabs, blocked author names, and other settings saved locally; no analytics or general click/keystroke log |

**Review Personally identifiable information:** PR author display names are read from rendered comments, and names added to the blocked list are saved and included in settings exports. Check the dashboard's current category definitions before certifying this release; do not simply reuse the 0.11.10 answers.

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
ADOverride has no separate account or paid features. You need an Azure DevOps Services organization and project with Azure Boards and an Azure Repos pull request containing fictional review activity.

1. Sign in at https://dev.azure.com using a test organization and project. Use English and a standard Agile or Scrum process. Create a few fictional work items if the Board is empty.
2. Open Boards > Boards, pin ADOverride, and open its popup.
3. In Library > Board layout, toggle Equal-width columns and Compact header. The Board should change without modifying work items.
4. In Library > Card fields, toggle Assignee or Tags. Fields should appear or disappear without changing the saved values.
5. Open a User Story or Bug. The popup selects Ticket. Expand Details under Cards & fields and toggle a supported section such as Description.
6. Open Layout and switch between Original and Workspace. On supported forms, Workspace shows the main text in a wide column and other fields in a sidebar.
7. Leave layout controls unlocked and drag a section by its extension handle. Undo restores the last work item customization. Lock removes the on-page controls.
8. Open the demo pull request. The popup selects PR. Overview becomes Activity, with Description and Checks beside it. Switch between them and confirm each section uses the full width.
9. In PR > Tabs, toggle a tab such as Updates. The current tab stays visible. In PR > Blocked, add the display name of an author with both active and resolved demo threads. Resolved threads fold; active threads stay visible.
10. Switch the native activity filter to Show everything to see update folding. Open a folded push's commit list, then switch to Files to check the compact file tree.
11. Turn off ADOverride using the switch at the top of the popup. Its layout changes are removed and saved settings are kept. A native activity filter already selected by the extension is not automatically reset.

Do not approve, complete, resolve, or post on a real PR during these checks. No personal access token is required. The extension only works on dev.azure.com and HTTPS *.visualstudio.com sites. Parts it does not recognize stay unchanged. On other websites the popup asks you to open an Azure DevOps page.
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

After publication, confirm the public listing shows version 0.11.18, the new title, and the PR screenshot. Upload to the existing item so current users receive the update with their settings intact.

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

Publish these images alongside the matching package, not on the older 0.11.10 listing by itself.

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
