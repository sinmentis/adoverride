# ADOverride

ADOverride changes the layout of Azure DevOps boards, work items, and pull requests in Chrome. You can hide fields, move sections in work items, make board columns wider, and put PR activity, descriptions, and checks in separate tabs. It only changes your view, not work item data or what other people see.

For Azure DevOps Services on `dev.azure.com` and `*.visualstudio.com`.

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo)** | [Getting started](docs/guide.md#install-in-chrome) | [Manual install / build from source](docs/guide.md#manual-install)

**[Version 0.11.19](https://github.com/sinmentis/adoverride/releases/tag/v0.11.19)** replaces the sliders icon with a blue O and an orange corner. It includes the PR settings from 0.11.18. Chrome Web Store updates need separate approval. If the store still shows 0.11.10, that version only supports Boards and work items.

[![The same demo board with ADOverride off and on](docs/images/board-hero.png)](docs/images/board-hero.png)

## Get started

1. Install from the store, pin **ADOverride**, and open an Azure DevOps Kanban board, work item, or pull request.
2. Click the extension icon. **Library** has the Board settings, **Ticket** has the work item settings, and **PR** has the pull request settings.
3. Turn individual options on or off.

The default preset applies automatically and hides some work item fields. Use **Ticket > Cards & fields > Show all** to show them again. The switch at the top of the popup turns off layout changes and keeps your saved settings.

When updating from 0.11.10, the PR settings turn on by default. They hide Updates and some extension tabs and select Active comments once. You can change this in the popup's PR section. Your existing Board and work item settings are kept.

Chrome updates store installations automatically. Use manual installation only for development or trying a build that is not in the store.

## Boards

Make columns fill the available width, reduce header spacing, and choose which fields appear on cards. The extension can also load more items automatically under your current filters. Save settings for one board, a project, an organization, or all supported sites.

## Work items

Show or hide supported pages, sections, and fields. Move sections, or use **Workspace** to put the main text in a wide column and other fields in a sidebar. You can lock the layout or undo your last change. Supported forms include User Stories and Bugs.

[![The same fictional work item before and after the wider reading layout](docs/images/ticket-before-after.png)](docs/images/ticket-before-after.png)

You can save presets and export or import settings as JSON. The [guide](docs/guide.md) explains each control.

## Compatibility

Some features need English page labels. Board layout changes work on supported Kanban boards, not every Backlog, Query, sprint, or custom layout. Parts the extension does not recognize stay unchanged. Azure DevOps Server on other domains is not supported.

## Privacy

Settings stay in your browser. The extension reads the current Azure DevOps page address and layout, and gets form-layout information from your organization using your existing sign-in. On PR pages it also reads comment author names and thread status for filtering. It does not send your work item or PR data to the developer, save changes to your work items, or post PR comments. There are no ads or analytics. [Privacy policy](PRIVACY.md).

*Screenshots use fictional work items and replayed layouts.*

## Pull requests

Overview splits into **Activity**, **Description**, and **Checks** tabs. Each tab uses the full width. You can fold passed checks, reviewers who have not voted, repeated updates, and resolved threads from selected authors. Active and pending threads stay visible. Choose which PR tabs to show and hide comment rows from the Files tree. [PR settings](docs/guide.md#tidy-a-pull-request).

[Guide](docs/guide.md) | [Privacy](PRIVACY.md) | [Contributing](CONTRIBUTING.md) | [Security](SECURITY.md) | [MIT](LICENSE)
