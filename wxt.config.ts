import { defineConfig } from 'wxt';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { INACTIVE_TOOLBAR_TITLE, toolbarIconPaths } from './lib/toolbar-icon';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  zip: {
    dotSources: true,
    includeSources: [
      'entrypoints/**/*', 'lib/**/*', 'assets/**/*', 'public/**/*', 'scripts/**/*', 'tests/**/*', 'docs/**/*',
      '.github/workflows/ci.yml', '.gitignore', 'package.json', 'package-lock.json', 'wxt.config.ts', 'tsconfig.json',
      'vitest.config.ts', 'playwright.config.ts', 'README.md', 'LICENSE', 'PRIVACY.md',
    ],
    excludeSources: [
      '**/.env*', '**/*.key', '**/*.pem', '**/*.pfx', '**/*.p12', '**/*.har',
      'node_modules/**/*', 'test-results/**/*', 'playwright-report/**/*', '.playwright-mcp/**/*', '.output/**/*',
      'ado-layout*.json', 'ado-board-layout*.json', 'ado-customize-config*.json', 'ado-customize-configuration*.json',
      'adoverride-config*.json', 'adoverride-configuration*.json',
    ],
  },
  hooks: {
    'build:done': async wxt => {
      for (const file of ['LICENSE', 'README.md', 'PRIVACY.md', 'assets/brand.svg', 'docs/guide.md', 'docs/publishing.md', 'docs/chrome-web-store.md',
        'docs/images/board-before-after.png', 'docs/images/board-hero.png', 'docs/images/ticket-before-after.png', 'docs/images/popup.png',
        'docs/store/LISTING.txt', 'docs/store/START-HERE.txt', 'docs/store/03-ticket-fields.jpg', 'docs/store/05-pull-request.jpg',
        'docs/images/social-preview.svg', 'docs/images/social-preview.png']) {
        const target = path.join(wxt.config.outDir, file);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(fileURLToPath(new URL(file, import.meta.url)), target);
      }
    },
    'vite:build:extendConfig': (entrypoints, config) => {
      if (entrypoints.some(entrypoint => entrypoint.name === 'popup')) {
        config.build ??= {};
        config.build.license = { fileName: 'THIRD-PARTY-NOTICES.txt' };
      }
      if (entrypoints.some(entrypoint => entrypoint.name === 'content')) {
        config.build ??= {};
        config.build.license = { fileName: 'THIRD-PARTY-NOTICES-CONTENT.txt' };
        config.resolve ??= {};
        const existing = config.resolve.alias ?? [];
        config.resolve.alias = [
          { find: /^@primer\/live-region-element$/, replacement: fileURLToPath(new URL('./lib/primer-announcements.ts', import.meta.url)) },
          ...(Array.isArray(existing) ? existing : Object.entries(existing).map(([find, replacement]) => ({ find, replacement }))),
        ];
      }
    },
  },
  manifest: {
    name: 'ADOverride - Customize Azure DevOps',
    description: 'Hide work item fields, widen boards, and organize pull request pages in Azure DevOps. Changes only affect your browser.',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'],
    action: { default_title: INACTIVE_TOOLBAR_TITLE, default_icon: toolbarIconPaths(false) },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
  },
});
