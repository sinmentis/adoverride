# Chrome Web Store listing and updates

This kit is for **0.11.23**, including permanent wide PR Files layouts. Update the [existing store item](https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo) with the package, description, and screenshots together. Store approval is separate from the GitHub release.

No store submission is made by the scripts in this repository.

## Before uploading: check the public developer address

Developer contact information belongs to the publisher account, not the extension manifest. Changing the package or its privacy policy cannot hide that information.

Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), select the correct publisher, and open **Account**. Check both the ordinary **Physical address** field and the **Trader / Non-trader** declaration.

| Situation | Action |
| --- | --- |
| Non-trader with an optional Physical address | Google's account guide requires this field for items offering purchases, additional paid features, or subscriptions. If none apply and the dashboard allows it, clear the optional address and save |
| Incorrect trader declaration | Correct it only if Non-trader truthfully describes the publisher's circumstances. Free or open-source software does not by itself determine legal status |
| Trader | Google publicly displays verified trader contact details. There is no supported hide-address toggle. Use a correct, verifiable contact address; do not enter a fake address |
| Updating a trader address in the same country | Google's FAQ directs publishers to the verification information in Google Payments settings. Other identity changes can require verification again |
| Address still visible or the setting is unavailable | Recheck the correct publisher account, then contact [Chrome Web Store support](https://support.google.com/chrome_webstore/contact/one_stop_support) |

After saving, inspect the public listing while signed out or in an incognito window. Do not assume an immediate update or change legal declarations just to remove an address. Do not put identity documents or personal addresses in GitHub issues, release files, or screenshots.

Official sources: [account fields](https://developer.chrome.com/docs/webstore/set-up-account), [trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure), and [trader verification FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq).

## 1. Update the existing item

Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the publishing account and select ADOverride, item `ijeoidnjoamdkpfgbnhfajddhpakobjo`. **Do not add a new item.**

The prepared kit contains the locally validated candidate `adoverride-0.11.23-chrome.zip` and `SHA256SUMS`. It does not mean that v0.11.23 has been published on GitHub. Before store submission, commit and push the reviewed source, images, and updated privacy policy; wait for CI; then follow the approved tag-release procedure in [Publishing](publishing.md). Download the resulting Chrome ZIP and its checksum from GitHub Releases for the store submission. If its bytes differ from the local candidate, use the published artifact and its own checksum together, not a mixture.

Do not upload a source archive or the outer release-kit ZIP as the extension package. Check the manifest version is 0.11.23.

Replace the detailed description with `store/LISTING.txt` and the five screenshots below. Keep the Offset icon; the kit includes its listing icon and promotional tiles for consistency. Review the new Files data handling and confirm the linked privacy policy is updated before submitting.

## 2. Store listing

| Field | Value |
| --- | --- |
| Name (from manifest) | ADOverride - Customize Azure DevOps |
| Language | English |
| Category | Workflow & Planning (the current listing category) |
| Homepage | https://github.com/sinmentis/adoverride |
| Support | https://github.com/sinmentis/adoverride/issues |
| Privacy policy | https://github.com/sinmentis/adoverride/blob/main/PRIVACY.md |
| Store icon | `store/icon-128.png` |
| Small promotional tile | `store/promo-440x280.png` |
| Optional marquee | `store/marquee-1400x560.png` |
| Screenshots, in order | `01-pr-files-wide.jpg`, `02-pr-files-bottom.jpg`, `03-pr-commits.jpg`, `04-pr-reading-space.jpg`, `05-work-item-layout.jpg`, all in `store/` |

The 0.11.23 package supplies this short description (119 characters):

```text
Hide work item fields, widen boards, and organize pull request pages in Azure DevOps. Changes only affect your browser.
```

Check that both the new title and this summary appear after uploading the package.

### Detailed description

Paste all of [store/LISTING.txt](store/LISTING.txt). Keep the description to a short feature summary; setup instructions and data-handling details belong in the guide and privacy policy.

## 3. Privacy practices

### Single purpose

```text
Change how Azure DevOps Boards, work items, and pull requests look in the user's browser. Users can hide fields, move form sections, choose visible PR tabs, fold activity, and navigate changed files in a drawer or bottom panel. Native editing and review controls remain owned by Azure DevOps.
```

### Permission justifications

**storage**

```text
Save settings in the browser: Board profiles, hidden work item fields, section positions, PR layout options, Files navigation position, hidden PR tabs, blocked author display names, presets, the last undoable change, and a backup before importing settings. File inventory and search text are not saved. Chrome Storage Sync is not used.
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

Keep accurate disclosures from the earlier version and review them against 0.11.23:

| Category | Why it applies |
| --- | --- |
| Website content | Rendered ADO structure, schema labels, work item IDs, PR status icons, author display names, thread status, file names/paths, selection, and reviewed state |
| Web history | Current supported-page URLs and derived organization/project/Board scope keys; no browsing-history log |
| User activity | User-chosen layouts, hidden tabs, blocked author names, and other settings saved locally; no analytics or general click/keystroke log |

**Review Personally identifiable information:** PR author display names are read from rendered comments, and names added to the blocked list are saved and included in settings exports. Check the dashboard's current category definitions before certifying this release; do not simply reuse the 0.11.10 answers.

Files navigation uses only the currently rendered native tree. It does not fetch another inventory or persist file paths, reviewed states, or search text. Selecting a file never marks it reviewed automatically. An explicit review-checkbox click invokes Azure DevOps' native control and can update that user's reviewed state through Azure DevOps.

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
10. Switch the native activity filter to Show everything to see update folding. Open a folded push's commit list.
11. Open Files on a small demo PR with a fully loaded, expanded file tree. In PR > Files, enable Wide Files layout. File navigation is its indented subsetting; choose Drawer.
12. The PR header, tabs, and actions remain visible while the code uses the available width. Click Files to open the drawer. Search by file name, select a file, and confirm selection does not mark it reviewed. Pin keeps the drawer beside the code; Unpin releases that width.
13. Choose Bottom panel in the popup. The searchable file list moves below the code. Minimize and Expand change its height, and the code editor resizes with it. The layout choice survives reload. There is no Enter/Exit focus mode.
14. On the fictional demo PR only, click a file's review checkbox and confirm it uses the native reviewed state. Unreviewed filters the current file inventory. No review action happens without a checkbox click.
15. Turn Wide Files layout off to restore the native sidebar. If the native tree is collapsed or incomplete, the extension keeps it and shows a notice instead of an incomplete replacement.
16. Turn off ADOverride using the switch at the top of the popup. Its layout changes are removed and saved settings are kept. A native activity filter already selected by the extension is not automatically reset.

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

After publication, confirm the public listing shows version 0.11.23, the Offset icon, the two Files comparisons, and the intended public developer details. Upload to the existing item so current users receive the update with their settings intact.

## Regenerating images

To rebuild the five store screenshots from the approved real-layout README posters, regenerate the listing icon, and validate the two curated promotional tiles without replacing them:

```sh
npm run store:assets
```

All five screenshots are 1280x800 JPEGs made from the approved PNG posters, not replacement fixture renders. The two Files posters replay captured native DOM/CSS with the actual 0.11.23 Files implementation and sample values. Matching regions retain the live capture's geometry within one CSS pixel. Each pair uses the same content, font size, viewport, and image scale. The measured 32% diff-width increase applies only to the displayed example.

Keep raw captures, extracted styles/fonts, intermediate HTML, and private browser artifacts outside the repository and release kit. `npm run screenshots` remains a fixture/popup tool; it does not recreate the real-layout posters. Publish the artwork alongside the matching package, not as a claim about the older store build.

The 440x280 promotional tile uses a branded Before/After PR Files comparison. The optional 1400x560 marquee compares both PR Files and Ticket Workspace. Both use the approved "More code. Less clutter." direction and real-layout captures with sample data. These PNGs are curated inputs; `npm run store:assets` validates their dimensions without overwriting them. The 128x128 listing icon uses the existing 96px Offset icon with transparent padding.

Official references:
[account](https://developer.chrome.com/docs/webstore/set-up-account),
[images](https://developer.chrome.com/docs/webstore/images),
[privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
[publishing](https://developer.chrome.com/docs/webstore/publish).
