# Contributing

Bug reports, layout fixes and small features are welcome. For anything large,
open an issue first so we can agree on the approach.

## Setup

Requires Node 22.12 or newer.

```sh
npm ci
npx playwright install chromium
npm run dev
```

## Before you open a pull request

```sh
npm run compile
npm test
npm run zip
npm run test:browser
```

Browser tests load the built extension against fictional ADO-style pages, so no
ADO account is needed. Add a test that fails without your change.

## Ground rules

- Keep native ADO intact. Don't move native nodes to new parents, recreate
  fields, or change values. Native drafts, Save and drag must keep working.
- Unknown layouts stay unchanged, with a visible notice.
- No telemetry, backend, tokens or automatic work-item writes.
- Fixtures and screenshots use made-up content only. Never commit real work
  items, people, organization URLs or exported configs.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
  `fix:`, `docs:`) and rebase on `main` instead of merging.

## Where things live

- Board adapter: `lib/board-*`
- Work item adapter: `lib/ticket-*`
- Popup: `entrypoints/popup`
- Settings, migrations and import/export: `lib/preferences.ts`,
  `lib/configuration.ts`

More detail is in the [guide](docs/guide.md#development-and-contributions).
Releases are covered in [publishing notes](docs/publishing.md).

By contributing, you agree your work is licensed under the [MIT License](LICENSE).
