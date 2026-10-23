import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { decodePreferences, defaultBoardProfile, defaultPreferences } from '../../lib/preferences';
import { exportConfiguration, parseConfiguration } from '../../lib/configuration';
import { readFile } from 'node:fs/promises';
import { TICKET_LAYOUT } from './ticket-fixtures';
import { workspaceTicketHtml } from './workspace-fixture';
import { capturedBoardHtml, loadMoreBoardHtml } from './board-fixture';
import { presentationBoardHtml } from './board-presentation-fixture';

type ExtensionApi = (typeof import('wxt/browser'))['browser'];
declare const chrome: ExtensionApi;
const ADDRESS = 'https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories?System.AssignedTo=%40me';
const KEY = `ado-customize.preferences.v${defaultPreferences().version}`;
async function launch(profile: string, factoryDefaults = false) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${path.resolve('.output/chrome-mv3')}`, `--load-extension=${path.resolve('.output/chrome-mv3')}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await expect.poll(() => worker.evaluate(() => chrome.storage.local.get(null))).not.toEqual({});
  if (!factoryDefaults) {
    const raw = await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], KEY);
    const current = decodePreferences(raw);
    if (JSON.stringify({ ...current, revision: 0 }) === JSON.stringify(defaultPreferences())) {
      await worker.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), {
        key: KEY, value: { ...current, views: { all: { ...current.views.all, board: defaultBoardProfile() } } },
      });
    }
  }
  return context;
}
async function boardFixture(context: BrowserContext, html = capturedBoardHtml()) {
  await context.route('https://dev.azure.com/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes('/_apis/')) {
      expect(route.request().method()).toBe('GET');
      const value = pathname.includes('/workitemtypes/') ? { referenceName: 'Example.UserStory', xmlForm: '<FORM><Layout /></FORM>' } :
        pathname.includes('/projects/') ? { capabilities: { processTemplate: { templateTypeId: 'fixture-process' } } } : TICKET_LAYOUT;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    }
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await expect.poll(() => worker.evaluate(() => chrome.storage.local.get(null))).not.toEqual({});
  const page = context.pages()[0] ?? await context.newPage();
  await page.setViewportSize({ width: 2005, height: 1271 });
  await page.goto(ADDRESS);
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  return { page, popup, worker };
}
async function settings(context: BrowserContext) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Missing Board settings worker.');
  return decodePreferences(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], KEY));
}
async function geometry(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector('.kanban-board-content');
    const headers = [...document.querySelectorAll('.kanban-board-column-header-container>.kanban-board-column-header')]
      .map(node => node.getBoundingClientRect().toJSON());
    const columns = [...document.querySelectorAll('.kanban-board-content>.kanban-board-column')]
      .map(node => node.getBoundingClientRect().toJSON());
    if (!row || !columns.length) throw new Error('Missing captured native Board geometry.');
    return { headers, columns, trailing: row.getBoundingClientRect().right - (columns.at(-1)?.right ?? 0),
      widthRange: Math.max(...columns.map(column => column.width)) - Math.min(...columns.map(column => column.width)) };
  });
}

test('kiwifruit Board default: only kiwifruit is built in and the requested setup applies without toggling', async ({}, info) => {
  const context = await launch(info.outputPath('profile'), true);
  try {
    const { page, popup } = await boardFixture(context, presentationBoardHtml());
    await expect(popup.getByRole('group', { name: 'Layout', exact: true }).getByRole('button', { name: 'Compact cards', exact: true })).toBeVisible();
    await expect(popup.getByRole('group', { name: 'Loading', exact: true }).getByRole('button', { name: 'Auto-load all items', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Choose preset, current kiwifruit', exact: true })).toBeVisible();
    for (const name of ['Equal-width columns', 'Compact header', 'Auto-load all items']) {
      await expect(popup.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(popup.getByRole('button', { name: 'Compact cards', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toBeHidden();
    await expect(page.locator('[data-ado-board-card]')).toHaveCount(0);
    await popup.getByRole('button', { name: 'Choose preset, current kiwifruit', exact: true }).click();
    await expect(popup.getByRole('menuitemradio')).toHaveCount(1);
    await expect(popup.getByRole('menuitemradio', { name: 'kiwifruit', exact: true })).toBeVisible();
    for (const name of ['Original', 'Equal columns', 'Default', 'Balanced', 'Focus', 'Compact']) {
      await expect(popup.getByRole('menuitemradio', { name, exact: true })).toHaveCount(0);
    }
    await popup.keyboard.press('Escape');
    await popup.locator('.popup').screenshot({ path: info.outputPath('kiwifruit-board-popup.png') });
  } finally { await context.close(); }
});

test('kiwifruit Board default: native batches load on a fresh install before a feature is toggled', async ({}, info) => {
  const context = await launch(info.outputPath('profile'), true);
  try {
    const { page } = await boardFixture(context, loadMoreBoardHtml());
    await expect(page.locator('.wit-card')).toHaveCount(16);
    await expect(page.locator('html')).toHaveAttribute('data-native-requests', '6');
    await expect(page.locator('html')).toHaveAttribute('data-native-max-active-requests', '1');
    await expect(page.locator('html')).not.toHaveAttribute('data-private-card-clicked', 'yes');
  } finally { await context.close(); }
});

test('kiwifruit upgrade: v10 saved templates disappear while active scoped profiles and new presets persist', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile);
  try {
    const { page, popup, worker } = await boardFixture(context, presentationBoardHtml());
    const old = await settings(context);
    const board = { ...defaultBoardProfile(), equalColumns: true, compactCards: true,
      cardFields: { ...defaultBoardProfile().cardFields, assignee: false } };
    const previous = { ...old, version: 10, savedPresets: [{ id: 'old-library', name: 'Old Library', board }],
      views: { all: { ...old.views.all, presetId: 'old-library', board } },
      ticket: { ...old.ticket, presetId: 'old-ticket', savedPresets: [{ id: 'old-ticket', name: 'Old Ticket', ticket: old.ticket }],
        layoutLocked: true } };
    await worker.evaluate(async value => {
      await chrome.storage.local.set({ 'ado-customize.preferences.v10': value });
      await chrome.storage.local.remove('ado-customize.preferences.v11');
    }, previous);
    await page.reload(); await page.bringToFront(); await popup.reload();
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences', action: { kind: 'initialize' } }));
    const migrated = await settings(context);
    expect(migrated.savedPresets).toEqual([]);
    expect(migrated.ticket.savedPresets).toEqual([]);
    expect(migrated.views.all?.board).toEqual(board);
    expect(migrated.ticket.hiddenTargets).toEqual(previous.ticket.hiddenTargets);
    expect(migrated.ticket.cardLayouts).toEqual(previous.ticket.cardLayouts);
    expect(migrated.ticket.layoutLocked).toBe(true);
    await expect(page.locator('.owner-row').first()).toBeHidden();
    await popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true }).click();
    await expect(popup.getByRole('menuitemradio')).toHaveCount(1);
    await popup.keyboard.press('Escape');
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('New personal setup');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await context.close();
    context = await launch(profile);
    const reopened = await boardFixture(context, presentationBoardHtml());
    await expect(reopened.popup.getByRole('button', { name: 'Choose preset, current New personal setup', exact: true })).toBeVisible();
    expect((await settings(context)).savedPresets).toHaveLength(1);
    expect((await settings(context)).ticket.savedPresets).toEqual([]);
  } finally { await context.close(); }
});

test('Board toolbar: a supported enabled Board stays blue even with Original presentation', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context);
    const tracking = await worker.evaluateHandle(() => {
      const native = chrome.action.setIcon.bind(chrome.action);
      const calls: Parameters<typeof chrome.action.setIcon>[0][] = [];
      chrome.action.setIcon = async details => { calls.push(details); return native(details); };
      return { calls, restore: () => { chrome.action.setIcon = native; } };
    });
    try {
      await page.reload(); await page.bringToFront(); await popup.reload();
      const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://dev.azure.com/*' }))[0]?.id);
      if (tabId === undefined) throw new Error('Missing supported Board tab.');
      const icon = () => tracking.evaluate((value, id) => {
        const path = value.calls.filter(call => call.tabId === id).at(-1)?.path;
        return typeof path === 'string' ? path : path?.['16'];
      }, tabId);
      await expect.poll(icon).toBe('icon/16.png');
      await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId)).toBe('ADOverride (active)');
      await expect(page.locator('[data-ado-board-root]')).toHaveCount(0);
      await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'false');
      await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
      await expect.poll(icon).toBe('icon-gray/16.png');
      await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
      await expect.poll(icon).toBe('icon/16.png');
    } finally { await tracking.evaluate(value => value.restore()); }
  } finally { await context.close(); }
});

test('Board toolbar lifecycle: native same-document navigation tracks filtered Board URLs in both directions', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context);
    await popup.close();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://dev.azure.com/*' }))[0]?.id);
    if (tabId === undefined) throw new Error('Missing same-document Board tab.');
    const tracking = await worker.evaluateHandle(() => {
      const native = chrome.action.setIcon.bind(chrome.action);
      const calls: Parameters<typeof chrome.action.setIcon>[0][] = [];
      chrome.action.setIcon = async details => { calls.push(details); return native(details); };
      return { calls, restore: () => { chrome.action.setIcon = native; } };
    });
    try {
      const title = () => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId);
      const icon = () => tracking.evaluate((value, id) => {
        const path = value.calls.filter(call => call.tabId === id).at(-1)?.path;
        return typeof path === 'string' ? path : path?.['16'];
      }, tabId);
      for (const address of [
        ADDRESS,
        'https://dev.azure.com/example/Platform/_boards/board/t/Example%20Team/Stories?System.IterationPath=%40currentIteration&System.AssignedTo=%40me',
        'https://dev.azure.com/example/Platform/_boards/board/t/Example%20Team/Stories?System.AssignedTo=%40me#board',
      ]) {
        await page.evaluate(() => history.pushState(null, '', '/example/Platform/_git/example'));
        await expect.poll(title).toBe('ADOverride (inactive)');
        await expect.poll(icon).toBe('icon-gray/16.png');
        await page.evaluate(value => history.pushState(null, '', value), address);
        await expect.poll(title).toBe('ADOverride (active)');
        await expect.poll(icon).toBe('icon/16.png');
      }
      await page.evaluate(() => history.back());
      await expect.poll(title).toBe('ADOverride (inactive)');
      await expect.poll(icon).toBe('icon-gray/16.png');
      await page.evaluate(() => history.forward());
      await expect.poll(title).toBe('ADOverride (active)');
      await expect.poll(icon).toBe('icon/16.png');
      await page.evaluate(() => history.pushState(null, '', `${location.pathname}?System.AssignedTo=%40me&text=example`));
      await expect.poll(title).toBe('ADOverride (active)');
      await expect.poll(icon).toBe('icon/16.png');
      const original = await settings(context);
      for (const enabled of [false, true]) {
        await worker.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), {
          key: KEY, value: { ...original, enabled, revision: original.revision + (enabled ? 2 : 1) },
        });
        await expect.poll(title).toBe(`ADOverride (${enabled ? 'active' : 'inactive'})`);
        await expect.poll(icon).toBe(enabled ? 'icon/16.png' : 'icon-gray/16.png');
      }
    } finally { await tracking.evaluate(value => value.restore()); }
  } finally { await context.close(); }
});

test('Board toolbar lifecycle: a fresh Board reader activates without opening the extension popup', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    await context.route('https://dev.azure.com/**', route =>
      route.fulfill({ contentType: 'text/html', body: capturedBoardHtml() }));
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get(null))).not.toEqual({});
    const tracking = await worker.evaluateHandle(() => {
      const native = chrome.action.setIcon.bind(chrome.action);
      const calls: Parameters<typeof chrome.action.setIcon>[0][] = [];
      chrome.action.setIcon = async details => { calls.push(details); return native(details); };
      return { calls, restore: () => { chrome.action.setIcon = native; } };
    });
    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(ADDRESS);
      const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://dev.azure.com/*' }))[0]?.id);
      if (tabId === undefined) throw new Error('Missing fresh Board tab.');
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId))
          .toBe('ADOverride (active)');
        await expect.poll(() => tracking.evaluate((value, id) => {
          const path = value.calls.filter(call => call.tabId === id).at(-1)?.path;
          return typeof path === 'string' ? path : path?.['16'];
        }, tabId)).toBe('icon/16.png');
      }
    } finally { await tracking.evaluate(value => value.restore()); }
  } finally { await context.close(); }
});

test('Board Card fields: a separate tab with a hidden count and no Columns controls', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, presentationBoardHtml());
    const layoutTab = popup.getByRole('tab', { name: 'Board layout', exact: true });
    const fieldsTab = popup.getByRole('tab', { name: /^Card fields/ });
    await expect(layoutTab).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByRole('button', { name: 'Assignee', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Columns', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Remember collapse', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('heading', { name: 'Board layout', exact: true })).toHaveCount(0);
    await expect(popup.getByText('Preset', { exact: true })).toHaveCount(0);
    await expect(fieldsTab).not.toContainText(/\d/);
    await fieldsTab.click();
    await expect(popup.getByRole('region', { name: 'Visible card fields', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveCount(0);
    await popup.getByRole('button', { name: 'Assignee', exact: true }).click();
    await expect(page.locator('.owner-row').first()).toBeHidden();
    await expect(fieldsTab).toContainText('1');
    await fieldsTab.focus();
    await popup.keyboard.press('ArrowLeft');
    await expect(layoutTab).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByRole('region', { name: 'Visible card fields', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toBeVisible();
    await popup.keyboard.press('ArrowRight');
    await expect(popup.getByRole('button', { name: 'Assignee', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await popup.locator('.popup').screenshot({ path: info.outputPath('card-fields-tab.png') });
  } finally { await context.close(); }
});

test('Board toolbar: a late initial settings read cannot override a newer master-off update', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, worker } = await boardFixture(context);
    const original = await settings(context);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://dev.azure.com/*' }))[0]?.id);
    if (tabId === undefined) throw new Error('Missing supported Board tab.');
    await worker.evaluate(async ({ tabId, key }) => chrome.scripting.executeScript({
      target: { tabId }, args: [key], func: key => {
        const get = chrome.storage.local.get.bind(chrome.storage.local);
        let release: () => void = () => { throw new Error('Settings read is not blocked.'); };
        const barrier = new Promise<void>(resolve => { release = resolve; });
        let first = true;
        const blockedGet = async (keys: unknown) => {
          if (!Array.isArray(keys) || !keys.every((key): key is string => typeof key === 'string')) {
            return Reflect.apply(get, chrome.storage.local, [keys]);
          }
          const value = await get(keys);
          if (first && keys.includes(key)) {
            first = false;
            document.documentElement.setAttribute('data-fixture-settings-read', 'blocked');
            await barrier;
            chrome.storage.local.get = get;
            document.documentElement.setAttribute('data-fixture-settings-read', 'finished');
          }
          return value;
        };
        Object.defineProperty(chrome.storage.local, 'get', { configurable: true, writable: true, value: blockedGet });
        Object.defineProperty(globalThis, 'adoFixtureReleaseSettings', { configurable: true, value: release });
      },
    }), { tabId, key: KEY });
    await worker.evaluate(id => chrome.scripting.executeScript({ target: { tabId: id }, files: ['/content-scripts/content.js'] }), tabId);
    await expect(page.locator('html')).toHaveAttribute('data-fixture-settings-read', 'blocked');
    await worker.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), {
      key: KEY, value: { ...original, enabled: false, revision: original.revision + 5 },
    });
    await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId)).toBe('ADOverride (inactive)');
    await worker.evaluate(id => chrome.scripting.executeScript({
      target: { tabId: id }, func: () => {
        const release = Reflect.get(globalThis, 'adoFixtureReleaseSettings');
        if (typeof release !== 'function') throw new Error('Missing blocked settings release.');
        release(); Reflect.deleteProperty(globalThis, 'adoFixtureReleaseSettings');
      },
    }), tabId);
    await expect(page.locator('html')).toHaveAttribute('data-fixture-settings-read', 'finished');
    await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId)).toBe('ADOverride (inactive)');
  } finally { await context.close(); }
});

test('Board compact presentation: captured card/header geometry tightens without changing native fonts, titles, parents or targets', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, presentationBoardHtml());
    const originalMarkup = await page.locator('.bolt-page').innerHTML();
    const originalHeight = await page.locator('.wit-card').first().evaluate(card => card.getBoundingClientRect().height);
    const originalTop = await page.locator('.kanban-board').evaluate(board => board.getBoundingClientRect().top);
    const nodes = await page.locator('.wit-card').first().evaluateHandle(card => [...card.querySelectorAll<HTMLElement>('*')].map(node =>
      ({ node, parent: node.parentElement, font: getComputedStyle(node).fontSize, text: node.textContent,
        targetHeight: node.matches('button,[role="button"]') ? node.getBoundingClientRect().height : null })));
    const ticket = (await settings(context)).ticket;
    await popup.getByRole('button', { name: 'Compact cards', exact: true }).click();
    await popup.getByRole('button', { name: 'Compact header', exact: true }).click();
    await expect.poll(() => page.locator('.wit-card').first().evaluate(card => card.getBoundingClientRect().height)).toBeLessThanOrEqual(originalHeight - 28);
    await expect.poll(() => page.locator('.kanban-board').evaluate(board => board.getBoundingClientRect().top)).toBeLessThanOrEqual(originalTop - 48);
    expect(await nodes.evaluate(items => items.every(item => item.node.isConnected && item.node.parentElement === item.parent &&
      getComputedStyle(item.node).fontSize === item.font && item.node.textContent === item.text &&
      (item.targetHeight === null || item.node.getBoundingClientRect().height >= item.targetHeight)))).toBe(true);
    await expect(page.getByRole('button', { name: 'Choose Board', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose work item type', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Board filter', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Board', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Change card owner', exact: true }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-native-interactions', '1');
    expect((await settings(context)).ticket).toEqual(ticket);
    await page.locator('.bolt-page').screenshot({ path: info.outputPath('compact-native-board.png'), caret: 'initial' });
    await popup.locator('.popup').screenshot({ path: info.outputPath('board-presentation-controls.png') });
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('[data-ado-board-card]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toBeVisible();
    expect(await page.locator('.bolt-page').innerHTML()).toBe(originalMarkup);
  } finally { await context.close(); }
});

test('Board card fields: each switch hides only the verified wrapper and never reads native values', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, presentationBoardHtml());
    await page.locator('.wit-card').evaluateAll(cards => {
      for (const card of cards) for (const value of card.querySelectorAll('.identity-display-name,.work-item-state-name,.native-field-value,.bolt-pill-content,.card-indicators button')) {
        Object.defineProperty(value, 'textContent', { configurable: true, get() { throw new Error('Native values must not be read.'); } });
      }
    });
    await popup.getByRole('tab', { name: /^Card fields/ }).click();
    for (const [label, selector] of [
      ['Assignee', '.owner-row'], ['State', '.work-item-state-container'], ['Tags', '.wit-card .margin-top-8:has(.bolt-pill)'],
      ['Story Points', '.field-container'], ['Child & link counts', '.card-indicators'],
    ]) {
      if (!label || !selector) throw new Error('Missing field contract.');
      await popup.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator(selector).first()).toBeHidden();
      await expect(page.locator('.wit-card a.bolt-link').first()).toBeVisible();
      await popup.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator(selector).first()).toBeVisible();
    }
  } finally { await context.close(); }
});

test('Board cards: inline drafts, changing schema labels and native card replacement remain safe', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, presentationBoardHtml());
    await popup.getByRole('button', { name: 'Compact cards', exact: true }).click();
    const card = page.locator('.wit-card').first();
    await card.locator('.owner-row').evaluate(row => row.insertAdjacentHTML('beforeend', '<input aria-label="Native owner draft">'));
    const draft = page.getByRole('textbox', { name: 'Native owner draft', exact: true });
    await draft.fill('Keep this native draft.');
    await popup.getByRole('tab', { name: /^Card fields/ }).click();
    await popup.getByRole('button', { name: 'Assignee', exact: true }).click();
    await expect(draft).toBeVisible();
    await expect(draft).toHaveValue('Keep this native draft.');
    await expect(card).not.toHaveAttribute('data-ado-board-card', '');
    await draft.evaluate(node => node.remove());
    await expect(card).toHaveAttribute('data-ado-board-card', '');
    await expect(card.locator('.owner-row')).toBeHidden();
    await popup.getByRole('button', { name: 'Story Points', exact: true }).click();
    await expect(card.locator('.field-container')).toBeHidden();
    await card.locator('.field-label').evaluate(label => {
      if (!label.firstChild) throw new Error('Missing native field label.');
      label.firstChild.nodeValue = 'Priority';
    });
    await expect(card.locator('.field-container')).toBeVisible();
    await card.evaluate(node => node.replaceWith(node.cloneNode(true)));
    await expect(card).toHaveAttribute('data-ado-board-card', '');
    await expect(card.locator('.owner-row')).toBeHidden();
    await expect(card.locator('.field-container')).toBeVisible();
    await card.locator('.flex-column.flex-grow').evaluate(content => content.append(document.createElement('iframe')));
    await expect(card).not.toHaveAttribute('data-ado-board-card', '');
    await expect(card.locator('.owner-row')).toBeVisible();
  } finally { await context.close(); }
});

test('Board compact presentation: narrow light views, native dragging, zoom and hover retain usable targets and scroll positions', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context, presentationBoardHtml(false));
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await popup.getByRole('button', { name: 'Compact cards', exact: true }).click();
    await popup.getByRole('button', { name: 'Compact header', exact: true }).click();
    await page.setViewportSize({ width: 740, height: 800 });
    const card = page.locator('.wit-card').first();
    await card.locator('.work-item-state-name').evaluate(label => { label.textContent = 'A long native workflow state name'; });
    await card.locator('.identity-display-name').evaluate(label => { label.textContent = 'A fictional owner with a long display name'; });
    const filter = page.getByRole('textbox', { name: 'Board filter', exact: true });
    await filter.fill('Keep the native filter');
    await expect.poll(() => page.locator('.board-scroll').evaluate(node => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
    const parent = await card.evaluateHandle(node => node.parentElement);
    const drop = page.locator('.kanban-board-column').nth(1);
    await drop.evaluate(column => {
      column.addEventListener('dragover', event => event.preventDefault());
      column.addEventListener('drop', event => { event.preventDefault(); column.setAttribute('data-native-drop', 'yes'); });
    });
    await card.dragTo(drop);
    await expect(drop).toHaveAttribute('data-native-drop', 'yes');
    expect(await card.evaluate((node, original) => node.parentElement === original, parent)).toBe(true);
    await expect(filter).toHaveValue('Keep the native filter');
    await page.locator('.board-scroll').evaluate(node => { node.scrollLeft = 180; });
    await page.locator('.kanban-board-column-header-container').evaluate(node => node.classList.add('native-hover'));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.locator('.board-scroll').evaluate(node => node.scrollLeft)).toBe(180);
    const shape = await card.evaluate(node => {
      const content = node.querySelector('.flex-column.flex-grow');
      const state = node.querySelector('.work-item-state-container');
      const owner = node.querySelector('.owner-row');
      if (!content || !state || !owner) throw new Error('Missing narrow native card geometry.');
      return { font: getComputedStyle(node).fontSize, right: content.getBoundingClientRect().right,
        stateRight: state.getBoundingClientRect().right, ownerRight: owner.getBoundingClientRect().right,
        targets: [...node.querySelectorAll('button,[role="button"]')].map(target => target.getBoundingClientRect().height) };
    });
    expect(shape.font).toBe('12px');
    expect(shape.stateRight).toBeLessThanOrEqual(shape.right + 1);
    expect(shape.ownerRight).toBeLessThanOrEqual(shape.right + 1);
    expect(shape.targets).toEqual([22, 32, 20, 18, 18]);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://dev.azure.com/*' }))[0]?.id);
    if (tabId === undefined) throw new Error('Missing Board zoom tab.');
    await worker.evaluate(id => chrome.tabs.setZoom(id, 1.25), tabId);
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(1.25);
    await expect(card.locator('a.bolt-link')).toHaveText('A fictional complete title that wraps naturally without any new truncation');
    await expect(page.getByRole('button', { name: 'Choose Board', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('Board presentation: unknown card content remains native and reports partial support', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, capturedBoardHtml());
    const original = await page.locator('.wit-card').first().innerHTML();
    await popup.getByRole('button', { name: 'Compact cards', exact: true }).click();
    await expect(popup.getByText('4 card layouts are unmapped and unchanged.', { exact: true })).toBeVisible();
    await expect(page.locator('[data-ado-board-card]')).toHaveCount(0);
    expect(await page.locator('.wit-card').first().innerHTML()).toBe(original);
  } finally { await context.close(); }
});

test('Board popup: explanations use real hover/focus help instead of permanent paragraphs', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup } = await boardFixture(context);
    await expect(popup.getByText('Local changes only. Native filters, cards and dragging stay in place.', { exact: true })).toHaveCount(0);
    await expect(popup.getByText(/Scope chooses where you save/)).toHaveCount(0);
    const help = popup.getByRole('button', { name: 'Help: Equal-width columns', exact: true });
    await help.hover();
    const tooltip = popup.getByRole('tooltip', { includeHidden: true }).filter({ hasText: 'Fill the Board width.' });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Fill the Board width.');
    const box = await tooltip.boundingBox();
    if (!box) throw new Error('Missing help tooltip geometry.');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(340);
    expect(box.y + box.height).toBeLessThanOrEqual(480);
    await popup.getByRole('tab', { name: 'Board layout', exact: true }).hover();
    await expect(tooltip).toBeHidden();
    await help.focus();
    await popup.keyboard.press('Tab');
    await popup.keyboard.press('Shift+Tab');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Fill the Board width.');
    await popup.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(help).toBeFocused();
    await popup.getByRole('button', { name: 'Compact cards', exact: true }).click();
    const bounds = await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).boundingBox();
    const body = await popup.locator('.popup-body').boundingBox();
    if (!bounds || !body) throw new Error('Missing compact popup geometry.');
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(body.y + body.height);
    await popup.getByRole('tab', { name: /^Card fields/ }).click();
    expect(await popup.locator('button[aria-labelledby],select[aria-labelledby],button[aria-expanded="true"][aria-controls]')
      .evaluateAll(controls => controls.flatMap(control => {
        const labels = control.getAttribute('aria-labelledby') ?? '';
        const panel = control.getAttribute('aria-expanded') === 'true' ? control.getAttribute('aria-controls') ?? '' : '';
        return `${labels} ${panel}`.trim().split(/\s+/).filter(Boolean)
          .filter(id => document.querySelectorAll(`#${CSS.escape(id)}`).length !== 1);
      }))).toEqual([]);
    await popup.getByRole('tab', { name: 'Board layout', exact: true }).click();
    await expect(popup.getByRole('region', { name: 'Visible card fields', exact: true })).toHaveCount(0);
    await popup.locator('.popup').screenshot({ path: info.outputPath('compact-popup-help.png') });
  } finally { await context.close(); }
});

test('Board diagnostics: one click downloads actual sampled card/header structure without native contents', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context);
    await page.locator('.wit-card').first().evaluate(card => {
      const owner = document.createElement('div');
      owner.className = 'field-row'; owner.setAttribute('data-field-name', 'System.AssignedTo');
      owner.textContent = 'PRIVATE_OWNER';
      const input = document.createElement('input'); input.value = 'PRIVATE_DRAFT';
      card.append(owner, input);
    });
    const original = await page.locator('.kanban-board').innerHTML();
    await popup.getByRole('button', { name: 'Inspection details', exact: true }).click();
    const pending = popup.waitForEvent('download', { timeout: 10000 });
    await popup.getByRole('button', { name: 'Download Board layout', exact: true }).click();
    const download = await pending;
    const file = info.outputPath('board-presentation.json');
    await download.saveAs(file);
    const text = await readFile(file, 'utf8');
    const report = JSON.parse(text);
    expect(report).toMatchObject({ kind: 'ado-board-presentation', version: 2, sampledCards: 4, truncated: false });
    expect(report.nodes.some((node: { nativeReference: string | null }) => node.nativeReference === 'System.AssignedTo')).toBe(true);
    for (const value of ['PRIVATE_OWNER', 'PRIVATE_DRAFT', 'Sample New work item', 'example/Platform', 'fixture-ticket']) expect(text).not.toContain(value);
    expect(await page.locator('.kanban-board').innerHTML()).toBe(original);
    await expect(page.locator('.wit-card input')).toHaveValue('PRIVATE_DRAFT');
  } finally { await context.close(); }
});

test('Board auto-load: every native batch loads serially without clicking card controls or changing filters', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, worker } = await boardFixture(context, loadMoreBoardHtml());
    const defaults = defaultPreferences();
    const ticket = (await settings(context)).ticket;
    const filter = page.getByRole('textbox', { name: 'Board filter', exact: true });
    await filter.fill('Sample');
    await worker.evaluate(async ({ key, value }) => chrome.storage.local.set({ [key]: value }), {
      key: KEY, value: { ...defaults, revision: 5, views: { ...defaults.views, all: {
        ...defaults.views.all, board: { ...defaults.views.all?.board, autoLoadItems: true },
      } } },
    });
    await expect.poll(() => page.locator('.wit-card').count()).toBe(16);
    expect(await page.locator('html').getAttribute('data-native-requests')).toBe('6');
    expect(await page.locator('html').getAttribute('data-native-max-active-requests')).toBe('1');
    expect(await page.locator('html').getAttribute('data-private-card-clicked')).toBeNull();
    await expect(filter).toHaveValue('Sample');
    expect((await settings(context)).ticket).toEqual(ticket);
  } finally { await context.close(); }
});

for (const roleLink of [false, true]) test(`Board auto-load: popup activates native ${roleLink ? 'role links' : 'anchors'} with icons and preserves focus, scrolling and Board widths`, async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context, loadMoreBoardHtml({ anchor: true, roleLink, icon: true }));
    const ticket = (await settings(context)).ticket;
    const parents = await page.locator('.kanban-board').evaluateHandle(root =>
      [...root.querySelectorAll('.wit-card')].map(node => ({ node, parent: node.parentElement })));
    await page.locator('.kanban-board-column').nth(1).evaluate(column => {
      const spacer = document.createElement('div');
      spacer.style.cssText = 'height:1800px;flex:none'; column.append(spacer);
      const scroll = document.querySelector('.board-scroll');
      if (!(scroll instanceof HTMLElement)) throw new Error('Missing native Board scroll owner.');
      scroll.scrollTop = 150;
      for (const more of document.querySelectorAll<HTMLElement>('.native-fixture-more')) more.addEventListener('click', () => {
        more.focus(); scroll.scrollTop = 0;
      });
    });
    const before = await settings(context);
    await worker.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), {
      key: KEY, value: { ...before, views: { ...before.views,
        'board:["example","platform/_boards/board/t/team/stories"]': { ...before.views.all, board: defaultBoardProfile() } } },
    });
    await popup.getByRole('combobox', { name: 'Scope', exact: true }).selectOption('board');
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    const widths = (await geometry(page)).columns.map(column => column.width);
    const filter = page.getByRole('textbox', { name: 'Board filter', exact: true });
    await filter.fill('Sample');
    await filter.focus();
    await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).click();
    await expect.poll(() => page.locator('.wit-card').count()).toBe(16);
    await expect(popup.locator('.popup-footer')).toContainText('Tickets loaded: 16');
    await expect(popup.getByText('No more native batches.', { exact: true })).toBeVisible();
    await expect(filter).toBeFocused();
    await expect(filter).toHaveValue('Sample');
    expect(await page.locator('.board-scroll').evaluate(node => node.scrollTop)).toBe(150);
    expect((await geometry(page)).columns.map(column => column.width)).toEqual(widths);
    expect(await parents.evaluate(items => items.every(item => item.node.isConnected && item.node.parentElement === item.parent))).toBe(true);
    expect(await page.locator('html').getAttribute('data-native-requests')).toBe('6');
    expect(await page.locator('html').getAttribute('data-native-max-active-requests')).toBe('1');
    expect(await page.locator('html').getAttribute('data-private-card-clicked')).toBeNull();
    expect((await settings(context)).ticket).toEqual(ticket);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://dev.azure.com/*' }))[0]?.id);
    if (tabId === undefined) throw new Error('Missing auto-load icon tab.');
    await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId)).toBe('ADOverride (active)');
    if (!roleLink) await popup.locator('.popup').screenshot({ path: info.outputPath('library-auto-load.png') });
  } finally { await context.close(); }
});

test('Board auto-load: a stalled native batch stops after 30 seconds and requires the popup Retry action', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, loadMoreBoardHtml({ stalled: true, batches: 1 }));
    const clock = await context.newCDPSession(page);
    const advance = async (milliseconds: number) => {
      const elapsed = new Promise<void>(resolve => clock.once('Emulation.virtualTimeBudgetExpired', () => resolve()));
      await clock.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: milliseconds });
      await elapsed;
    };
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-native-requests', '1');
    await expect(popup.getByText('Loading more items...', { exact: true })).toBeVisible();
    await advance(31000);
    await expect(popup.getByRole('alert')).toContainText('No loading progress for 30 seconds');
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(1);
    await advance(60000);
    await expect(page.locator('html')).toHaveAttribute('data-native-requests', '1');
    await page.locator('html').evaluate(node => { node.dataset.nativeStalled = 'false'; });
    await popup.getByRole('button', { name: 'Retry auto-loading', exact: true }).click();
    await advance(2000);
    await expect.poll(() => page.locator('.wit-card').count()).toBe(8);
    await expect(page.locator('html')).toHaveAttribute('data-native-requests', '3');
    await expect(popup.getByRole('button', { name: 'Retry auto-loading', exact: true })).toHaveCount(0);
    await expect(popup.locator('.popup-footer')).toContainText('Tickets loaded: 8');
  } finally { await context.close(); }
});

for (const master of [false, true]) test(`Board auto-load: ${master ? 'master pause' : 'switching the feature off'} stops future batches without cancelling the native read already started`, async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, loadMoreBoardHtml({ delay: 1200 }));
    const ticket = (await settings(context)).ticket;
    await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-native-active-requests', '1');
    await popup.getByRole('button', { name: master ? 'Enable ADOverride' : 'Auto-load all items', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-native-active-requests', '0');
    expect(await page.locator('.wit-card').count()).toBe(6);
    expect(await page.locator('html').getAttribute('data-native-requests')).toBe('1');
    await expect(popup.getByRole('button', { name: 'Auto-load all items', exact: true })).toHaveAttribute('aria-pressed', String(master));
    expect((await settings(context)).ticket).toEqual(ticket);
  } finally { await context.close(); }
});

test('Board auto-load: native dialogs pause new batches and closing the dialog safely resumes loading', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, loadMoreBoardHtml({ delay: 500 }));
    await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-native-active-requests', '1');
    await page.evaluate(() => {
      const dialog = document.createElement('section');
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-label', 'Native Board settings');
      dialog.innerHTML = '<input aria-label="Native settings draft">';
      document.body.append(dialog);
    });
    const draft = page.getByRole('textbox', { name: 'Native settings draft', exact: true });
    await draft.fill('Keep this draft unchanged');
    await expect(popup.getByText('Auto-load paused.', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-native-active-requests', '0');
    expect(await page.locator('html').getAttribute('data-native-requests')).toBe('1');
    await expect(draft).toHaveValue('Keep this draft unchanged');
    await page.getByRole('dialog', { name: 'Native Board settings', exact: true }).evaluate(node => node.remove());
    await expect.poll(() => page.locator('.wit-card').count()).toBe(16);
    await expect(page.locator('html')).toHaveAttribute('data-native-requests', '6');
    await expect(page.locator('html')).toHaveAttribute('data-native-max-active-requests', '1');
  } finally { await context.close(); }
});

test('Board auto-load: collapsed columns stay collapsed and their remaining batches load only after native expansion', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, loadMoreBoardHtml());
    await page.getByRole('button', { name: 'Collapse Closed', exact: true }).click();
    await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).click();
    await expect.poll(() => page.locator('.wit-card').count()).toBe(10);
    await expect(popup.getByText('No more native batches.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse Closed', exact: true })).toHaveAttribute('aria-expanded', 'false');
    expect(await page.locator('html').getAttribute('data-native-requests')).toBe('3');
    await page.getByRole('button', { name: 'Collapse Closed', exact: true }).click();
    await expect.poll(() => page.locator('.wit-card').count()).toBe(16);
    await expect(page.locator('html')).toHaveAttribute('data-native-requests', '6');
    await expect(popup.locator('.popup-footer')).toContainText('Tickets loaded: 16');
  } finally { await context.close(); }
});

for (const columnCount of [2, 5]) test(`Board equal columns: captured native ${columnCount}-column tracks fill the available width without trailing blank space`, async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, worker } = await boardFixture(context);
    if (columnCount === 2) await page.evaluate(() => {
      for (const row of document.querySelectorAll('.kanban-board-column-header-container,.kanban-board-content')) {
        for (const column of [...row.children].slice(2)) column.remove();
      }
    });
    const original = await geometry(page);
    expect(original.trailing).toBeGreaterThan(100);
    const defaults = defaultPreferences();
    await worker.evaluate(async ({ value, key }) => { await chrome.storage.local.set({ [key]: value }); },
      { key: `ado-customize.preferences.v${defaults.version}`, value: {
        ...defaults, revision: 5, views: { ...defaults.views, all: { ...defaults.views.all, board: { ...defaults.views.all?.board, equalColumns: true } } },
      } });
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    const applied = await geometry(page);
    expect(applied.widthRange).toBeLessThanOrEqual(1);
    for (let index = 0; index < applied.columns.length; index++) {
      expect(applied.columns[index]?.x).toBeCloseTo(applied.headers[index]?.x ?? 0, 1);
      expect(applied.columns[index]?.width).toBeCloseTo(applied.headers[index]?.width ?? 0, 1);
    }
  } finally { await context.close(); }
});

test('Board Library: real toggle fills columns, retains native controls and restores the exact original layout', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context);
    const original = await geometry(page);
    const originalMarkup = await page.locator('.kanban-board').innerHTML();
    const cards = await page.locator('.kanban-board').evaluateHandle(root =>
      [...root.querySelectorAll<HTMLElement>('.wit-card')].map(node => ({ node, parent: node.parentElement,
        font: getComputedStyle(node).fontSize, markup: node.innerHTML })));
    await expect(popup.getByRole('tab', { name: 'Board layout', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Hide unused services', exact: true })).toHaveCount(0);
    await expect(popup.getByText('Library settings are saved, not applied.', { exact: true })).toHaveCount(0);
    const ticket = (await settings(context)).ticket;
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect(popup.getByRole('region', { name: 'Board customization', exact: true }).getByRole('status')).toContainText('Equal widths. 5 expanded');
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    expect((await settings(context)).ticket).toEqual(ticket);
    expect(await cards.evaluate(items => items.every(item => item.node.isConnected && item.node.parentElement === item.parent &&
      getComputedStyle(item.node).fontSize === item.font && item.node.innerHTML === item.markup))).toBe(true);
    await page.locator('.kanban-board').screenshot({ path: info.outputPath('board-equal-widths.png') });
    await popup.locator('.popup').screenshot({ path: info.outputPath('real-library.png') });
    await page.getByRole('textbox', { name: 'Board filter', exact: true }).fill('Sample');
    await expect(page.getByRole('textbox', { name: 'Board filter', exact: true })).toHaveValue('Sample');
    const first = page.locator('.wit-card').first();
    const drop = page.locator('.kanban-board-column').nth(2);
    await drop.evaluate(column => {
      column.addEventListener('dragover', event => event.preventDefault());
      column.addEventListener('drop', event => { event.preventDefault(); column.setAttribute('data-native-drop', 'yes'); });
    });
    await first.dragTo(drop);
    await expect(drop).toHaveAttribute('data-native-drop', 'yes');
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://dev.azure.com/*' }))[0]?.id);
    if (tabId === undefined) throw new Error('Missing Board icon tab.');
    await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId)).toBe('ADOverride (active)');
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(0);
    await expect.poll(() => geometry(page)).toEqual(original);
    await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId)).toBe('ADOverride (inactive)');
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(0);
    await drop.evaluate(column => column.removeAttribute('data-native-drop'));
    expect(await page.locator('.kanban-board').innerHTML()).toBe(originalMarkup);
  } finally { await context.close(); }
});

test('Board equal columns: native collapse, narrow horizontal scrolling and long headers stay aligned', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context, capturedBoardHtml(false));
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await page.getByRole('button', { name: 'Collapse New', exact: true }).click();
    await expect(popup.getByRole('region', { name: 'Board customization', exact: true }).getByRole('status')).toContainText('4 expanded, 1 collapsed');
    const collapsed = await geometry(page);
    expect(collapsed.columns[0]?.width).toBe(40);
    expect(collapsed.headers[0]?.width).toBe(40);
    expect(Math.max(...collapsed.columns.slice(1).map(column => column.width)) - Math.min(...collapsed.columns.slice(1).map(column => column.width))).toBeLessThanOrEqual(1);
    expect(collapsed.trailing).toBeLessThanOrEqual(4.1);
    await page.getByRole('button', { name: 'Collapse New', exact: true }).click();
    await expect(popup.getByRole('region', { name: 'Board customization', exact: true }).getByRole('status')).toContainText('5 expanded, 0 collapsed');
    await page.locator('.kanban-board-column-header>span').nth(2).evaluate(node => {
      node.textContent = 'A long workflow stage with a native count and header controls';
    });
    await page.setViewportSize({ width: 740, height: 800 });
    await expect.poll(() => page.locator('.board-scroll').evaluate(node => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
    const narrow = await geometry(page);
    for (let index = 0; index < narrow.columns.length; index++) {
      expect(narrow.columns[index]?.width).toBeGreaterThanOrEqual(220);
      expect(narrow.columns[index]?.x).toBeCloseTo(narrow.headers[index]?.x ?? 0, 1);
      expect(narrow.columns[index]?.width).toBeCloseTo(narrow.headers[index]?.width ?? 0, 1);
    }
    await page.locator('.board-scroll').evaluate(node => { node.scrollLeft = 200; });
    await page.locator('.kanban-board-column-header-container').evaluate(node => node.classList.add('native-hover'));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.locator('.board-scroll').evaluate(node => node.scrollLeft)).toBe(200);
    await page.setViewportSize({ width: 2200, height: 1100 });
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://dev.azure.com/*' });
      if (tabs[0]?.id === undefined) throw new Error('Missing Board zoom tab.');
      await chrome.tabs.setZoom(tabs[0].id, 1.25);
    });
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(1.25);
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
  } finally { await context.close(); }
});

test('Board Library: scoped presets persist and export/import includes only actual Board options', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile);
  try {
    const { page, popup } = await boardFixture(context, presentationBoardHtml());
    await popup.getByRole('combobox', { name: 'Scope', exact: true }).selectOption('board');
    await popup.getByRole('button', { name: 'Choose preset, current kiwifruit', exact: true }).click();
    await popup.getByRole('menuitemradio', { name: 'kiwifruit', exact: true }).click();
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await popup.getByRole('button', { name: 'Compact cards', exact: true }).click();
    await popup.getByRole('tab', { name: /^Card fields/ }).click();
    await popup.getByRole('button', { name: 'Assignee', exact: true }).click();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Wide Board');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Wide Board', exact: true })).toBeVisible();
    const before = await settings(context);
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    const pending = popup.waitForEvent('download');
    await popup.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const file = info.outputPath('board-config.json');
    await (await pending).saveAs(file);
    const portable = parseConfiguration(await readFile(file, 'utf8')).preferences;
    expect(portable.views).toEqual(before.views);
    expect(portable.savedPresets[0]?.board).toEqual({ ...defaultBoardProfile(), equalColumns: true, autoLoadItems: true,
      compactCards: true, compactHeader: true, cardFields: { ...defaultBoardProfile().cardFields, assignee: false } });
    const incoming = exportConfiguration(before);
    incoming.preferences.theme = 'dark';
    await popup.locator('input[type="file"]').setInputFiles({ name: 'board-import.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(incoming)) });
    await expect(popup.getByRole('table', { name: 'Configuration preview', exact: true })).toContainText('Equal-width scopes');
    await expect(popup.getByRole('table', { name: 'Configuration preview', exact: true })).toContainText('Auto-load scopes');
    await expect(popup.getByRole('table', { name: 'Configuration preview', exact: true })).toContainText('Compact-card scopes');
    await expect(popup.getByRole('table', { name: 'Configuration preview', exact: true })).not.toContainText('Saved column choices');
    await popup.getByRole('button', { name: 'Replace configuration', exact: true }).click();
    await context.close();
    context = await launch(profile);
    const reopened = await boardFixture(context, presentationBoardHtml());
    await expect(reopened.popup.getByRole('button', { name: 'Choose preset, current Wide Board', exact: true })).toBeVisible();
    await expect(reopened.popup.getByRole('button', { name: 'Auto-load all items', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(reopened.popup.getByRole('button', { name: 'Compact cards', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(reopened.page.locator('.owner-row').first()).toBeHidden();
    await expect(reopened.page.getByRole('button', { name: 'Collapse Closed', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => geometry(reopened.page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await reopened.page.goto(ADDRESS.replace('/Team/', '/Other/'));
    await reopened.page.bringToFront();
    await reopened.popup.reload();
    await expect(reopened.popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => geometry(reopened.page).then(value => value.trailing)).toBeGreaterThan(100);
  } finally { await context.close(); }
});

test('Board adapter: unknown split/swimlane content stays native and recovers after a native rerender', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context);
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(1);
    await page.locator('.kanban-board-content').evaluate(row => {
      const region = document.createElement('section');
      region.className = 'unknown-swimlane';
      region.textContent = 'Unmapped native content';
      row.append(region);
    });
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(0);
    await expect(popup.getByText(/unsupported column, split-column or swimlane structure/)).toBeVisible();
    await expect(page.getByText('Unmapped native content', { exact: true })).toBeVisible();
    await page.locator('.unknown-swimlane').evaluate(node => node.remove());
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(1);
    await page.locator('.kanban-board-column').first().evaluate(node => { node.style.flexGrow = '2'; });
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(0);
    await expect(popup.getByText('Native column sizing cannot be aligned safely. Original Board widths are retained.', { exact: true })).toBeVisible();
    await page.locator('.kanban-board-column').first().evaluate(node => node.style.removeProperty('flex-grow'));
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(1);
    await page.locator('.kanban-board').evaluate(root => { root.replaceWith(root.cloneNode(true)); });
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await popup.getByRole('button', { name: 'Inspection details', exact: true }).click();
    const diagnostics = popup.getByLabel('Inspection diagnostics', { exact: true });
    await expect(diagnostics).toContainText('"board"');
    await expect(diagnostics).toContainText('"trailingSpace": 4');
    for (const value of ['Sample New work item', 'example/Platform', 'dev.azure.com', '101']) await expect(diagnostics).not.toContainText(value);
  } finally { await context.close(); }
});

test('Board migration: v6 preview profiles stay inactive and the existing Ticket profile is preserved', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context);
    const current = defaultPreferences();
    current.ticket.layoutLocked = true;
    const legacy = { ...current, version: 6, views: { all: { presetId: 'compact', appearance: {
      ...current.views.all?.appearance, density: 'compact',
    } } }, savedPresets: [{ id: 'legacy-local', name: 'Saved preview', appearance: current.views.all?.appearance }] };
    await worker.evaluate(async value => {
      await chrome.storage.local.set({ 'ado-customize.preferences.v6': value });
      await chrome.storage.local.remove('ado-customize.preferences.v11');
    }, legacy);
    await page.reload();
    await page.bringToFront();
    await popup.reload();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-ado-board-root]')).toHaveCount(0);
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences', action: { kind: 'initialize' } }));
    const migrated = await settings(context);
    expect(migrated.ticket).toEqual(legacy.ticket);
    expect(migrated.views.all?.appearance).toEqual(legacy.views.all.appearance);
    expect(migrated.savedPresets).toEqual([]);
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('ado-customize.preferences.v6'))['ado-customize.preferences.v6'])).toEqual(legacy);
    await worker.evaluate(() => chrome.storage.local.set({ 'ado-customize.preferences.v11': null }));
    await popup.reload();
    await expect(popup.getByText('Unsupported preferences version. Reset preferences to recover.', { exact: true })).toBeVisible();
    await worker.evaluate(value => chrome.storage.local.set({ 'ado-customize.preferences.v11': value }), migrated);
    await popup.reload();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'false');
  } finally { await context.close(); }
});

test('Board migration: v7 recovery retains equal widths and Ticket setup without auto-loading native cards', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context, loadMoreBoardHtml());
    const current = await settings(context);
    const previous = { ...current, version: 7,
      views: { all: { ...current.views.all, board: { equalColumns: true } } } };
    await worker.evaluate(async value => {
      await chrome.storage.local.set({ 'ado-customize.preferences.v7': value });
      await chrome.storage.local.remove('ado-customize.preferences.v11');
    }, previous);
    await page.reload();
    await page.bringToFront();
    await popup.reload();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(popup.getByRole('button', { name: 'Auto-load all items', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences', action: { kind: 'initialize' } }));
    const migrated = await settings(context);
    expect(migrated.views.all?.board).toEqual({ ...defaultBoardProfile(), equalColumns: true });
    expect(migrated.ticket).toEqual(current.ticket);
    expect(await page.locator('.wit-card').count()).toBe(4);
    expect(await page.locator('html').getAttribute('data-native-requests')).toBe('0');
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('ado-customize.preferences.v7'))['ado-customize.preferences.v7'])).toEqual(previous);
  } finally { await context.close(); }
});

test('Board migration: v8 recovery preserves existing width, loading, preset and Ticket setup with new options off', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context, presentationBoardHtml());
    const current = await settings(context);
    const previous = { ...current, version: 8, theme: 'dark', ticket: { ...current.ticket, layoutLocked: true },
      savedPresets: [{ id: 'existing-board', name: 'Existing Board', board: { equalColumns: true, autoLoadItems: true } }],
      views: { all: { ...current.views.all, presetId: 'existing-board', board: { equalColumns: true, autoLoadItems: true } } } };
    await worker.evaluate(async value => {
      await chrome.storage.local.set({ 'ado-customize.preferences.v8': value });
      await chrome.storage.local.remove('ado-customize.preferences.v11');
    }, previous);
    await page.reload(); await page.bringToFront(); await popup.reload();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(popup.getByRole('button', { name: 'Auto-load all items', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(popup.getByRole('button', { name: 'Compact cards', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(popup.getByRole('button', { name: 'Compact header', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-ado-board-card]')).toHaveCount(0);
    await expect(page.locator('.owner-row').first()).toBeVisible();
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences', action: { kind: 'initialize' } }));
    const migrated = await settings(context);
    expect(migrated.views.all?.board).toEqual({ ...defaultBoardProfile(), equalColumns: true, autoLoadItems: true });
    expect(migrated.ticket).toEqual(previous.ticket);
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('ado-customize.preferences.v8'))['ado-customize.preferences.v8'])).toEqual(previous);
  } finally { await context.close(); }
});

test('Board migration: retired v9 column memory is dropped and native collapse no longer saves or replays', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context, presentationBoardHtml());
    const original = await settings(context);
    const board = { ...defaultBoardProfile(), equalColumns: true, autoLoadItems: true, compactCards: true, compactHeader: true,
      cardFields: { ...defaultBoardProfile().cardFields, assignee: false }, rememberColumns: true, columnStates: { 'column:closed': true } };
    const previous = { ...original, version: 9, ticket: { ...original.ticket, layoutLocked: true },
      savedPresets: [{ id: 'saved-board', name: 'Saved Board', board }],
      views: { all: { ...original.views.all, presetId: 'saved-board', board } } };
    await worker.evaluate(async value => {
      await chrome.storage.local.set({ 'ado-customize.preferences.v9': value });
      await chrome.storage.local.remove('ado-customize.preferences.v11');
    }, previous);
    await page.reload(); await page.bringToFront(); await popup.reload();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Columns', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Compact cards', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.owner-row').first()).toBeHidden();
    const closed = page.getByRole('button', { name: 'Collapse Closed', exact: true });
    await expect(closed).toHaveAttribute('aria-expanded', 'true');
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences', action: { kind: 'initialize' } }));
    const migrated = await settings(context);
    expect(migrated.version).toBe(11);
    expect(migrated.ticket).toEqual(previous.ticket);
    expect(migrated.savedPresets).toEqual([]);
    for (const profile of [migrated.views.all?.board]) {
      expect(profile).not.toHaveProperty('rememberColumns');
      expect(profile).not.toHaveProperty('columnStates');
    }
    await closed.click();
    await expect(closed).toHaveAttribute('aria-expanded', 'false');
    await expect(popup.getByRole('region', { name: 'Board customization', exact: true }).getByRole('status')).toContainText('1 collapsed');
    expect(await settings(context)).toEqual(migrated);
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(closed).toHaveAttribute('aria-expanded', 'false');
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(closed).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.kanban-board-column').nth(1)).toBeVisible();
    await page.reload();
    await expect(closed).toHaveAttribute('aria-expanded', 'true');
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('ado-customize.preferences.v9'))['ado-customize.preferences.v9'])).toEqual(previous);
  } finally { await context.close(); }
});

test('Board scope: project overrides remain effective while All ADO is the popup editing target', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context);
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await popup.getByRole('combobox', { name: 'Scope', exact: true }).selectOption('project');
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await popup.getByRole('button', { name: 'Compact header', exact: true }).click();
    await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).click();
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeGreaterThan(100);
    await popup.getByRole('combobox', { name: 'Scope', exact: true }).selectOption('all');
    await expect(popup.getByRole('button', { name: 'Equal-width columns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(popup.getByRole('region', { name: 'Board customization', exact: true }).getByRole('status')).toContainText('Original widths');
    await popup.getByRole('combobox', { name: 'Scope', exact: true }).selectOption('board');
    await popup.getByRole('button', { name: 'Choose preset, current kiwifruit', exact: true }).click();
    await popup.getByRole('menuitemradio', { name: 'kiwifruit', exact: true }).click();
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
  } finally { await context.close(); }
});

test('Board saving: failed writes leave actual widths and saved preferences unchanged until retry', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup, worker } = await boardFixture(context);
    const original = await settings(context);
    const restore = await worker.evaluateHandle(() => {
      const set = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = async () => { throw new Error('Fixture storage quota exceeded.'); };
      return () => { chrome.storage.local.set = set; };
    });
    try {
      await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
      await expect(popup.getByRole('alert')).toContainText('Fixture storage quota exceeded.');
      expect(await settings(context)).toEqual(original);
      expect((await geometry(page)).trailing).toBeGreaterThan(100);
      await expect(page.locator('[data-ado-board-root]')).toHaveCount(0);
    } finally { await restore.evaluate(callback => callback()); }
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
  } finally { await context.close(); }
});

test('Board and Ticket: foreground Workspace and its native controls remain isolated from Board styling', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await boardFixture(context, loadMoreBoardHtml({ delay: 700 }));
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    const board = await geometry(page);
    await popup.getByRole('button', { name: 'Auto-load all items', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-native-active-requests', '1');
    const ticket = workspaceTicketHtml(true).replace(/<div class="kanban-board">[\s\S]*?<\/div><\/div>/, '');
    await page.evaluate(html => {
      const template = document.createElement('template');
      template.innerHTML = html;
      for (const style of template.content.querySelectorAll('style')) document.head.append(style);
      const dialog = template.content.querySelector<HTMLElement>('.work-item-form-dialog');
      if (!dialog) throw new Error('Missing native Ticket dialog fixture.');
      Object.assign(dialog.style, { position: 'fixed', left: '80px', top: '80px', zIndex: '10', background: '#242424' });
      document.body.append(dialog);
    }, ticket);
    await expect(popup.getByRole('searchbox', { name: 'Find a Ticket card or field', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await expect(page.locator('.work-item-form-dialog [data-ado-board-expanded]')).toHaveCount(0);
    expect((await geometry(page)).columns).toEqual(board.columns);
    const draft = page.getByRole('textbox', { name: 'Description draft', exact: true });
    await draft.fill('Board styles must not affect this native draft.');
    await expect(page.locator('html')).toHaveAttribute('data-native-active-requests', '0');
    expect(await page.locator('html').getAttribute('data-native-requests')).toBe('1');
    await expect(draft).toHaveText('Board styles must not affect this native draft.');
    await page.locator('.work-item-form-dialog').evaluate(node => node.remove());
    await expect(popup.getByRole('tab', { name: 'Board layout', exact: true })).toBeVisible();
    await expect.poll(() => geometry(page).then(value => value.trailing)).toBeLessThanOrEqual(4.1);
    await expect.poll(() => page.locator('.wit-card').count()).toBe(16);
    await expect(page.locator('html')).toHaveAttribute('data-native-requests', '6');
    await expect(page.locator('html')).toHaveAttribute('data-native-max-active-requests', '1');
  } finally { await context.close(); }
});
