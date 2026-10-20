# ADOverride

**Customize your Azure DevOps view without changing your team's setup.**

A Chrome extension to hide work item fields, rearrange form sections, and make
Kanban boards use more of your screen. Layout changes affect your browser, not
your teammates' views or your Azure DevOps process.

For Azure DevOps Services on `dev.azure.com` and `*.visualstudio.com`.

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/adoverride-azure-devops-b/ijeoidnjoamdkpfgbnhfajddhpakobjo)** |
[Getting started](docs/guide.md#install-in-chrome) |
[Manual install / build from source](docs/guide.md#manual-install)

**Available in the store: v0.11.10**, with Boards and work item customization.
The newer pull request features on `main` (v0.11.17) are **not in the store
version yet**.

[![Before and after: the same fictional Azure DevOps board uses the available width with ADOverride](docs/images/board-hero.png)](docs/images/board-hero.png)

## Get started

1. Install from the store, pin **ADOverride**, and open an Azure DevOps Kanban
   board or work item.
2. Click the extension icon. **Library** contains Board settings; **Ticket**
   contains work item settings.
3. Choose the fields and layout you want. The built-in preset applies
   automatically and hides some work item fields. Turn the switch at the top
   of the popup off to see Azure DevOps' own layout; your preferences are kept.

Chrome updates store installations automatically. Manual installation is for
development or trying a build that has not reached the store.

## Use the full width of your Kanban board

Use equal-width columns, reduce header spacing, and choose which fields appear
on cards. Load more items through Azure DevOps' native controls under your
current filters. Save Board settings for one board, a project, an organization,
or all supported sites.

## Hide work item fields and give descriptions more room

Show or hide supported form sections and fields, move sections into your
preferred arrangement, or use **Workspace** for a wider reading area with
properties alongside it. Lock the layout or undo your last customization.
Works with supported User Story, Bug, and other work item forms.

[![The same fictional work item before and after the wider reading layout](docs/images/ticket-before-after.png)](docs/images/ticket-before-after.png)

Save personal presets or transfer settings with JSON export/import.
See the [guide](docs/guide.md) for individual controls and how to restore hidden
fields.

## Compatibility and privacy

Supports Azure DevOps Services on `dev.azure.com` and `*.visualstudio.com`.
Some features depend on English labels. Board layout support targets Kanban
boards, not every Backlog, Query, sprint, or custom layout. Unsupported parts
may stay unchanged. Azure DevOps Server on other domains is not supported.

Settings are stored locally. No analytics or developer backend.
ADOverride reads the page address and layout to apply settings, and requests
form-layout metadata from your own Azure DevOps organization using your existing
sign-in. It does not send your work item data to the developer or submit work
item changes. [Read the privacy policy](PRIVACY.md).

*Screenshots use fictional work items and replayed layouts, not company data.*

## Pull request improvements on main

**Not included in the current store or latest tagged release, v0.11.10.**

The newer source build splits Overview into **Activity**, **Description**, and
**Checks**, gives discussions the full width, and folds passed checks and
repeated updates. Resolved threads from selected authors can fold away; active
and pending threads stay visible. [Explore the PR controls](docs/guide.md#tidy-a-pull-request)
or [build from source](docs/guide.md#from-source).

[Guide](docs/guide.md) | [Privacy](PRIVACY.md) | [Contributing](CONTRIBUTING.md) | [Security](SECURITY.md) | [MIT](LICENSE)
