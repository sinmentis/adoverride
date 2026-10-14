import { expect, test, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { decodePreferences } from '../../lib/preferences';

type ExtensionApi = (typeof import('wxt/browser'))['browser'];
// Chrome returns DOM windows here, not the browser-window metadata in WXT's API types.
declare const chrome: Omit<ExtensionApi, 'extension'> & {
  extension: { getViews(filter: { type: 'popup' }): Window[] };
};

const ADDRESS = 'https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories';
const FIXTURE = `<!doctype html><html><head><title>POC board fixture</title>
<style>.wit-card { display: block; width: 220px; height: 40px; margin: 8px; }</style></head><body>
<div class="kanban-board">
  <article class="wit-card boards-card"><span class="font-weight-semibold selectable-text">101</span><span>First example ticket</span></article>
  <article class="wit-card" data-work-item-id="102">Second example ticket</article>
  <article class="wit-card" data-work-item-id="101">Duplicate rendered instance</article>
  <div hidden><article class="wit-card" data-work-item-id="103">Hidden item</article></div>
</div></body></html>`;

const GRID_FIXTURE = `<!doctype html><html><head><title>Work item list fixture</title></head><body>
<nav><a href="/example/Platform/_workitems/edit/999">Unrelated navigation link</a></nav>
<table class="bolt-table" role="treegrid"><tbody>
  <tr role="row"><th role="columnheader">Title</th></tr>
  <tr class="bolt-table-row" role="row"><td><a href="/example/Platform/_workitems/edit/101">First item</a></td></tr>
  <tr class="bolt-table-row" role="row"><td><a href="/example/Platform/_workitems/edit/102">Second item</a></td></tr>
  <tr class="bolt-table-row" role="row"><td><a href="/example/Platform/_workitems/edit/101">Duplicate item</a></td></tr>
  <tr class="bolt-table-row" role="row" hidden><td><a href="/example/Platform/_workitems/edit/103">Hidden item</a></td></tr>
</tbody></table></body></html>`;

for (const scenario of [
  {
    name: 'backlog table inspection',
    address: 'https://dev.azure.com/example/Platform/_backlogs/backlog/Team%20A/Stories?showParents=true&System.AssignedTo=%40me',
    body: '<table role="treegrid"><tr role="row"><td><a href="/example/Platform/_workitems/edit/101">Item</a></td></tr></table>',
    existingTab: false,
    tickets: 1,
  },
  { name: 'pre-existing ADO tab inspection without a manual reload', address: ADDRESS, body: '<div class="wit-card" data-work-item-id="101">Item</div>', existingTab: true, tickets: 1 },
  {
    name: 'backlog with filters, duplicates, hidden rows and navigation links',
    address: 'https://dev.azure.com/example/Platform/_backlogs/backlog/Team%20A/Stories?showParents=true&System.AssignedTo=%40me',
    body: GRID_FIXTURE, existingTab: false, tickets: 2,
  },
  { name: 'sprint backlog rows', address: 'https://dev.azure.com/example/Platform/_sprints/backlog/Team', body: GRID_FIXTURE, existingTab: false, tickets: 2 },
  { name: 'sprint taskboard cards', address: 'https://dev.azure.com/example/Platform/_sprints/taskboard/Team', body: FIXTURE, existingTab: false, tickets: 2 },
  { name: 'query result rows', address: 'https://dev.azure.com/example/Platform/_queries/query/example', body: GRID_FIXTURE, existingTab: false, tickets: 2 },
  { name: 'work item list rows', address: 'https://dev.azure.com/example/Platform/_workitems/recentlyupdated', body: GRID_FIXTURE, existingTab: false, tickets: 2 },
  {
    name: 'loaded work item editor',
    address: 'https://dev.azure.com/example/Platform/_workitems/edit/101',
    body: '<div class="work-item-form-page"><header class="work-item-form-header">Loaded editor</header></div>',
    existingTab: false, tickets: 1,
  },
]) {
  test(scenario.name, async ({}, testInfo) => {
    const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
      channel: 'chromium',
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-unsafe-extension-debugging'],
    });
    try {
      await context.route('https://dev.azure.com/**', route => route.fulfill({ contentType: 'text/html', body: scenario.body }));
      const board = context.pages()[0] ?? await context.newPage();
      if (scenario.existingTab) await board.goto(scenario.address);
      const browser = context.browser();
      if (!browser) throw new Error('The extension test requires a browser-level CDP connection.');
      const cdp = await browser.newBrowserCDPSession();
      const installed = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('.output/chrome-mv3') });
      if (!scenario.existingTab) await board.goto(scenario.address);
      const original = await board.locator('body').innerHTML();
      const popup = await context.newPage();
      await board.bringToFront();
      await popup.goto(`chrome-extension://${installed.id}/popup.html`);
      await expect(popup.locator('[data-inspector-state]')).toHaveText(`Tickets loaded: ${scenario.tickets}`);
      const version = await popup.evaluate(() => chrome.runtime.getManifest().version);
      await expect(popup.locator('[data-extension-version]')).toHaveText(`v${version}`);
      await popup.getByRole('button', { name: 'Inspection details', exact: true }).click();
      const diagnostics = await popup.getByLabel('Inspection diagnostics').textContent();
      expect(JSON.parse(diagnostics ?? '').connection).toBe(scenario.existingTab ? 'on-demand' : 'existing');
      expect(diagnostics).not.toContain('dev.azure.com');
      expect(diagnostics).not.toContain('101');
      await expect(board.locator('body')).toHaveJSProperty('innerHTML', original);
    } finally {
      await context.close();
    }
  });
}

test('installed extension counts tickets without altering the page and persists preferences', async ({}, testInfo) => {
  const extensionPath = path.resolve('.output/chrome-mv3');
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    const browserContext = context;
    const worker = browserContext.serviceWorkers()[0] ?? await browserContext.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await browserContext.route('https://dev.azure.com/**', route => route.fulfill({
      contentType: 'text/html',
      body: FIXTURE,
    }));
    const board = browserContext.pages()[0] ?? await browserContext.newPage();
    await board.goto(ADDRESS);
    const original = await board.locator('body').innerHTML();

    const popup = await browserContext.newPage();
    await board.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole('heading', { name: 'ADOverride', exact: true })).toBeVisible();
    await expect(popup.locator('[data-inspector-state]')).toHaveText('Tickets loaded: 2');
    await expect(board.locator('body')).toHaveJSProperty('innerHTML', original);

    // Chromium exposes toolbar popups as non-page targets, not Playwright pages.
    await worker.evaluate(() => chrome.action.openPopup());
    await expect.poll(() => popup.evaluate(() => {
      const view = chrome.extension.getViews({ type: 'popup' })[0];
      const bounds = view?.document.querySelector('.popup')?.getBoundingClientRect();
      return {
        count: view?.document.querySelector('[data-inspector-state]')?.textContent,
        width: bounds?.width,
        height: bounds?.height,
      };
    })).toEqual({ count: 'Tickets loaded: 2', width: 340, height: 480 });
    await popup.evaluate(() => {
      for (const view of chrome.extension.getViews({ type: 'popup' })) view.close();
    });

    const size = await popup.locator('.popup').evaluate(element => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }));
    expect(size).toEqual({ width: 340, height: 480 });
    expect(await popup.locator('.popup').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(board.locator('body')).toHaveJSProperty('innerHTML', original);
    await popup.getByRole('combobox', { name: 'Scope', exact: true }).selectOption('project');
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await popup.getByRole('combobox', { name: 'Scope', exact: true }).selectOption('all');
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await popup.getByRole('button', { name: 'Compact cards', exact: true }).click();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Local POC');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Local POC', exact: true })).toBeVisible();
    await popup.close();

    const reopened = await browserContext.newPage();
    await board.bringToFront();
    await reopened.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(reopened.getByRole('button', { name: 'Choose preset, current Local POC', exact: true })).toBeVisible();
    await expect(reopened.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await board.evaluate(() => {
      const card = document.createElement('article');
      card.className = 'wit-card';
      card.setAttribute('data-work-item-id', '103');
      card.textContent = 'Newly loaded ticket';
      document.querySelector('.kanban-board')?.appendChild(card);
    });
    const changed = await board.locator('body').innerHTML();
    await board.bringToFront();
    await reopened.getByRole('button', { name: 'Refresh ticket count', exact: true }).click();
    await expect(reopened.locator('[data-inspector-state]')).toHaveText('Tickets loaded: 3');
    await expect(board.locator('body')).toHaveJSProperty('innerHTML', changed);

    await board.evaluate(() => {
      const card = document.createElement('article');
      card.className = 'wit-card';
      card.textContent = 'Card without an identifiable ID';
      document.querySelector('.kanban-board')?.appendChild(card);
    });
    await reopened.getByRole('button', { name: 'Refresh ticket count', exact: true }).click();
    await expect(reopened.locator('[data-inspector-state]')).toHaveText('Cards loaded: 5');

    await board.evaluate(body => {
      history.pushState({}, '', '/example/Platform/_backlogs/backlog/Team%20A/Stories?showParents=true');
      document.body.innerHTML = body;
    }, GRID_FIXTURE);
    const listBefore = await board.locator('body').innerHTML();
    await reopened.getByRole('button', { name: 'Refresh ticket count', exact: true }).click();
    await expect(reopened.locator('[data-inspector-state]')).toHaveText('Tickets loaded: 2');
    await expect(board.locator('body')).toHaveJSProperty('innerHTML', listBefore);
    await reopened.getByRole('button', { name: 'Inspection details', exact: true }).click();
    const details = JSON.parse(await reopened.getByLabel('Inspection diagnostics').textContent() ?? '');
    expect(details).toMatchObject({ view: 'backlog', surface: 'rows', uniqueTickets: 2, renderedItems: 3 });
    await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    await reopened.bringToFront();
    await reopened.getByRole('button', { name: 'Copy diagnostics', exact: true }).click();
    await expect.poll(() => reopened.evaluate(() => navigator.clipboard.readText())).toContain('"surface": "rows"');
    await reopened.getByRole('button', { name: 'Back to feature library', exact: true }).click();

    await reopened.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(reopened.locator('[data-inspector-state]')).toHaveText('Inspector paused');
    await reopened.getByRole('button', { name: 'Switch popup to dark theme', exact: true }).click();
    await expect(reopened.locator('.popup')).toHaveCSS('background-color', 'rgb(13, 17, 23)');
    await reopened.locator('.popup').screenshot({ path: testInfo.outputPath('popup.png') });

    const stored = decodePreferences(await worker.evaluate(async () => {
      const data = await chrome.storage.local.get('ado-customize.preferences.v11');
      return data['ado-customize.preferences.v11'];
    }));
    expect(stored.enabled).toBe(false);
    expect(stored.theme).toBe('dark');
    expect(stored.savedPresets).toHaveLength(1);
  } finally {
    await context?.close();
  }
});
