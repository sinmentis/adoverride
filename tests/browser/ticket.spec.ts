import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { nativeActionsTicketHtml, nativeTicketHtml, ticketHtml, TICKET_LAYOUT } from './ticket-fixtures';
import { boardOpenedWorkspaceHtml, workspaceTicketHtml } from './workspace-fixture';
import { decodePreferences, decodeTicketProfile, defaultPreferences, defaultView, portablePreferences } from '../../lib/preferences';
import { CONFIGURATION_BACKUP_KEY, decodeConfigurationBackup, exportConfiguration, parseConfiguration } from '../../lib/configuration';
import { nativePreferences } from '../preferences-fixture';
import { BUG_LAYOUT, bugTicketHtml } from './bug-fixture';

type ExtensionApi = (typeof import('wxt/browser'))['browser'];
declare const chrome: Omit<ExtensionApi, 'extension'> & {
  extension: { getViews(filter: { type: 'popup' }): Window[] };
};

async function launch(profile: string, factoryDefaults = false) {
  const extension = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await expect.poll(() => worker.evaluate(() => chrome.storage.local.get(null))).not.toEqual({});
  if (!factoryDefaults) {
    const value = await worker.evaluate(async () => (await chrome.storage.local.get('ado-customize.preferences.v11'))['ado-customize.preferences.v11']);
    if (value !== undefined) {
      const current = decodePreferences(value);
      if (JSON.stringify({ ...current, revision: 0 }) === JSON.stringify(defaultPreferences())) {
        await worker.evaluate(preferences => chrome.storage.local.set({ 'ado-customize.preferences.v11': preferences }),
          { ...nativePreferences(), revision: current.revision });
      }
    }
  }
  return context;
}
async function fixture(context: BrowserContext, origin: string, dialog: boolean, denied = false, unknownType = false, html = ticketHtml(dialog),
  metadata = { reference: 'Example.UserStory', layout: TICKET_LAYOUT }, beforeMetadata?: () => Promise<void>) {
  const calls: string[] = [];
  await context.route(`${origin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/_apis/')) {
      expect(request.method()).toBe('GET');
      calls.push(url.pathname);
      if (beforeMetadata) await beforeMetadata();
      if (denied) return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      const unrelatedLayout = { pages: [{
        id: 'other.details', label: 'Details', pageType: 'custom', sections: [{
          id: 'other', groups: [{ id: 'other.repro', label: 'Repro Steps', controls: [] }],
        }],
      }] };
      const data = url.pathname.includes('/workitemtypes/') ? { referenceName: metadata.reference, xmlForm: '<FORM><Layout /></FORM>' } :
        url.pathname.includes('/projects/') ? { capabilities: { processTemplate: { templateTypeId: 'process-fixture' } } } :
          url.pathname.endsWith('/layout') ? url.pathname.includes(metadata.reference) ? metadata.layout : unrelatedLayout :
            url.pathname.endsWith('/workItemTypes') ? { value: [
              { name: 'User Story', referenceName: 'Example.UserStory' },
              { name: 'Bug', referenceName: 'Example.Bug' },
              { name: 'Task', referenceName: 'Example.Task' },
            ] } : null;
      expect(data).not.toBeNull();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    }
    const body = unknownType ? html.replaceAll('data-work-item-type="User Story"', '') : html;
    return route.fulfill({ contentType: 'text/html', body });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = context.pages()[0] ?? await context.newPage();
  const prefix = origin.includes('visualstudio.com') ? '' : '/example';
  await page.goto(`${origin}${prefix}/Platform/${dialog ? '_boards/board/t/Team/Stories' : '_workitems/edit/101'}`);
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  return { page, popup, calls };
}
async function find(popup: Page, name: string) {
  await popup.getByRole('searchbox', { name: 'Find a Ticket card or field' }).fill(name);
}
async function dragToDevelopment(page: Page, name: 'Planning' | 'Description' = 'Planning') {
  await page.locator(`[id="sample.${name.toLowerCase()}"]`).hover();
  const handle = page.getByRole('button', { name: `Move ${name}`, exact: true });
  await expect(handle).toBeEnabled();
  const source = await handle.boundingBox();
  const target = await page.locator('#sample\\.development').boundingBox();
  if (!source || !target) throw new Error('Missing drag geometry.');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 3 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, { steps: 12 });
  await page.mouse.up();
}
async function savedSettings(context: BrowserContext) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('No extension worker.');
  return decodePreferences(await worker.evaluate(async () => {
    const result = await chrome.storage.local.get('ado-customize.preferences.v11');
    return result['ado-customize.preferences.v11'];
  }));
}
async function pausePreferenceWrites(context: BrowserContext) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('No extension worker.');
  return worker.evaluateHandle(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    let resolve!: () => void;
    const barrier = new Promise<void>(done => { resolve = done; });
    chrome.storage.local.set = async items => { await barrier; await original(items); };
    return () => { chrome.storage.local.set = original; resolve(); };
  });
}

test('Bug discovery: repeated System Info captions and the captured header variant retain a complete usable Workspace', async ({}, info) => {
  const context = await launch(info.outputPath('profile'), true);
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, bugTicketHtml({ extraGroups: false }),
      { reference: 'Example.Bug', layout: BUG_LAYOUT });
    await page.setViewportSize({ width: 2560, height: 1271 });
    await expect(page.locator('.work-item-form-group,.work-item-form-discussion')).toHaveCount(8);
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await popup.getByRole('searchbox', { name: 'Find a Ticket card or field' }).fill('System Info');
    for (const name of ['System Info (main)', 'System Info (side)']) {
      await expect(popup.getByRole('button', { name, exact: true })).toHaveCount(1);
      await expect(popup.getByRole('button', { name: `Show ${name}`, exact: true })).toBeEnabled();
    }
  } finally { await context.close(); }
});

test('Bug discovery: repeated captions without native group IDs bind by their fields and keep drag handles', async ({}, info) => {
  const context = await launch(info.outputPath('profile'), true);
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false,
      bugTicketHtml({ extraGroups: false, headerless: false, ids: false }), { reference: 'Example.Bug', layout: BUG_LAYOUT });
    await page.setViewportSize({ width: 2560, height: 1271 });
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    for (const name of ['System Info (main)', 'System Info (side)']) {
      await expect(page.getByRole('button', { name: `Move ${name}`, exact: true })).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: 'Move Planning', exact: true })).toHaveCount(1);
    await popup.getByRole('searchbox', { name: 'Find a Ticket card or field' }).fill('System Info');
    for (const name of ['System Info (main)', 'System Info (side)']) {
      await expect(popup.getByRole('button', { name: `Show ${name}`, exact: true })).toBeEnabled();
    }
    await popup.getByRole('button', { name: 'Show System Info (side)', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Regression', exact: true })).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'System Info draft', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('Bug discovery: pending form metadata does not disable a safely bound native field menu', async ({}, info) => {
  const context = await launch(info.outputPath('profile'), true);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  try {
    const { popup } = await fixture(context, 'https://dev.azure.com', false, false, false, bugTicketHtml(),
      { reference: 'Example.Bug', layout: BUG_LAYOUT }, () => barrier);
    await expect(popup.getByLabel('Loading Ticket layout', { exact: true })).toBeVisible();
    await popup.getByRole('searchbox', { name: 'Find a Ticket card or field' }).fill('Priority');
    await expect(popup.getByRole('button', { name: 'Show Priority', exact: true })).toBeEnabled();
  } finally { release(); await context.close(); }
});

test('Bug discovery: a schema-bound card without a native heading retains its fields in Workspace', async ({}, info) => {
  const context = await launch(info.outputPath('profile'), true);
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false,
      bugTicketHtml({ extraGroups: false, heading: false }), { reference: 'Example.Bug', layout: BUG_LAYOUT });
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Regression', exact: true })).toHaveValue('No');
    await expect(page.getByRole('textbox', { name: 'How Found', exact: true })).toHaveValue('Testing');
  } finally { await context.close(); }
});

test('Toolbar activity: actual icons follow Board Tickets, lock, master switch, reload and unrelated tabs', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('Missing toolbar test worker.');
    const icons = await worker.evaluateHandle(() => {
      const original = chrome.action.setIcon.bind(chrome.action);
      const calls: { tabId?: number | null; path?: string | Record<string, string> }[] = [];
      chrome.action.setIcon = async details => {
        calls.push({ tabId: details.tabId, path: details.path });
        await original(details);
      };
      return { calls, restore: () => { chrome.action.setIcon = original; } };
    });
    try {
      const html = boardOpenedWorkspaceHtml(true)
        .replace('<div class="work-item-form-dialog"', '<button type="button" data-native-open>Open Ticket</button><div hidden class="work-item-form-dialog"');
      const { page, popup } = await fixture(context, 'https://dev.azure.com', true, false, false, html);
      await page.setViewportSize({ width: 1536, height: 825 });
      const tabId = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ url: 'https://dev.azure.com/*' });
        const tab = tabs[0];
        if (tab?.id === undefined) throw new Error('Missing toolbar test tab.');
        return tab.id;
      });
      const title = () => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId);
      const icon = () => icons.evaluate((log, id) => {
        const path = log.calls.filter(call => call.tabId === id).at(-1)?.path;
        return typeof path === 'object' ? path['16'] : path;
      }, tabId);
      await expect.poll(title).toBe('ADOverride (active)');
      expect(await worker.evaluate(() => chrome.runtime.getManifest().action?.default_icon)).toEqual({
        16: 'icon-gray/16.png', 32: 'icon-gray/32.png', 48: 'icon-gray/48.png', 96: 'icon-gray/96.png', 128: 'icon-gray/128.png',
      });
      await page.getByRole('button', { name: 'Open Ticket', exact: true }).evaluate(button => {
        button.addEventListener('click', () => document.querySelector('.work-item-form-dialog')?.removeAttribute('hidden'));
      });
      await page.getByRole('button', { name: 'Open Ticket', exact: true }).click();
      await expect.poll(title).toBe('ADOverride (active)');
      await expect.poll(icon).toBe('icon/16.png');
      await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
      const native = await page.locator('#sample\\.planning .work-item-form-section-controls').evaluateHandle(controls =>
        [...controls.querySelectorAll<HTMLButtonElement>(':scope > button')].map(node => ({
          node, parent: node.parentElement, height: node.getBoundingClientRect().height, font: getComputedStyle(node).fontSize,
        })));
      await expect(page.getByRole('button', { name: 'Hide Planning', exact: true })).toHaveCount(1);
      await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
      await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(0);
      await expect(page.locator('[data-ado-ticket-ui="card-actions"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'View Planning', exact: true })).toBeVisible();
      expect(await native.evaluate(buttons => buttons.length === 4 && buttons.every(button =>
        button.node.isConnected && button.node.parentElement === button.parent &&
        button.node.getBoundingClientRect().height === button.height && getComputedStyle(button.node).fontSize === button.font))).toBe(true);
      await expect.poll(title).toBe('ADOverride (active)');
      await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
      await expect.poll(title).toBe('ADOverride (inactive)');
      await expect.poll(icon).toBe('icon-gray/16.png');
      await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
      await expect.poll(title).toBe('ADOverride (active)');
      await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(0);
      await page.getByRole('button', { name: 'Close', exact: true }).evaluate(button => {
        button.addEventListener('click', () => document.querySelector('.work-item-form-dialog')?.setAttribute('hidden', ''));
      });
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect.poll(title).toBe('ADOverride (active)');
      await expect.poll(icon).toBe('icon/16.png');
      await page.reload();
      await expect.poll(title).toBe('ADOverride (active)');
      await page.getByRole('button', { name: 'Open Ticket', exact: true }).evaluate(button => {
        button.addEventListener('click', () => document.querySelector('.work-item-form-dialog')?.removeAttribute('hidden'));
      });
      await page.getByRole('button', { name: 'Open Ticket', exact: true }).click();
      await expect.poll(title).toBe('ADOverride (active)');
      await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(0);
      await page.bringToFront();
      await popup.reload();
      await popup.getByRole('button', { name: 'Unlock layout', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Hide Planning', exact: true })).toHaveCount(1);
      const unchangedCalls = await icons.evaluate((log, id) => log.calls.filter(call => call.tabId === id).length, tabId);
      await page.locator('#sample\\.planning').hover();
      await page.locator('#sample\\.planning').evaluate(card => card.classList.add('native-toolbar-hover'));
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await icons.evaluate((log, id) => log.calls.filter(call => call.tabId === id).length, tabId)).toBe(unchangedCalls);
      await context.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Unrelated page</title>' }));
      const unrelated = await context.newPage();
      await unrelated.goto('https://example.com/');
      await unrelated.bringToFront();
      const otherTab = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id === undefined) throw new Error('Missing unrelated tab.');
        return tabs[0].id;
      });
      await expect.poll(() => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), otherTab)).toBe('ADOverride (inactive)');
      await page.bringToFront();
      await expect.poll(title).toBe('ADOverride (active)');
      await page.goto('https://example.com/other');
      await expect.poll(title).toBe('ADOverride (inactive)');
      await expect.poll(icon).toBe('icon-gray/16.png');
    } finally { await icons.evaluate(log => log.restore()); }
  } finally { await context.close(); }
});

test('kiwifruit built-in: fresh installs have one template and Show all remains undoable', async ({}, info) => {
  const context = await launch(info.outputPath('profile'), true);
  try {
    const html = workspaceTicketHtml()
      .replace('<div class="work-item-form-group" id="sample.planning">', `<div class="work-item-form-group" id="sample.risk">
        <div class="work-item-form-collapsible-header"><span>Risk assessment comment</span></div>
        <div class="work-item-form-control-wrapper"><label>Comment</label><input value="Sample optional comment"></div>
      </div><div class="work-item-form-group" id="sample.planning">`)
      .replace('<div class="work-item-form-collapsible-section-content" id="sample.planning-fields">',
        `<div class="work-item-form-collapsible-section-content" id="sample.planning-fields">
          <div class="work-item-form-control-wrapper" data-field-name="Microsoft.VSTS.Scheduling.RemainingWork">
            <label>Remaining Work</label><input value="3">
          </div>`);
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, html);
    await expect(popup.getByRole('button', { name: 'Choose preset, current kiwifruit', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Workspace view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await expect(page.locator('#sample\\.risk')).not.toBeVisible();
    await expect(page.locator('[data-field-name="Microsoft.VSTS.Scheduling.RemainingWork"]')).not.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Team', exact: true })).not.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Exception Handling', exact: true })).not.toBeVisible();
    expect(decodeTicketProfile((await savedSettings(context)).ticket)).toEqual(decodeTicketProfile(defaultPreferences().ticket));
    const draft = page.getByRole('textbox', { name: 'Description draft', exact: true });
    await draft.fill('The kiwifruit preset must preserve this draft.');
    const identity = await draft.evaluateHandle(node => ({ node, parent: node.parentElement }));
    await popup.getByRole('button', { name: 'Choose preset, current kiwifruit', exact: true }).click();
    await expect(popup.getByRole('menuitemradio')).toHaveCount(1);
    await expect(popup.getByRole('menuitemradio', { name: 'Default', exact: true })).toHaveCount(0);
    await popup.keyboard.press('Escape');
    await popup.getByRole('button', { name: 'Show all', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await expect(page.locator('#sample\\.risk')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Team', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Undo last Ticket change', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current kiwifruit', exact: true })).toBeVisible();
    await expect(page.locator('#sample\\.risk')).not.toBeVisible();
    expect(await identity.evaluate(state => state.node.isConnected && state.node.parentElement === state.parent)).toBe(true);
    await expect(draft).toHaveText('The kiwifruit preset must preserve this draft.');
    await popup.locator('.popup').screenshot({ path: info.outputPath('kiwifruit-default-popup.png') });
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    const pending = popup.waitForEvent('download');
    await popup.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const download = await pending;
    const file = info.outputPath('kiwifruit-configuration.json');
    await download.saveAs(file);
    const exported = parseConfiguration(await readFile(file, 'utf8')).preferences;
    expect(exported.ticket.presetId).toBe('ticket:kiwifruit');
    expect(decodeTicketProfile(exported.ticket)).toEqual(decodeTicketProfile(defaultPreferences().ticket));
    expect(exported.ticket.undo).toBeNull();
  } finally { await context.close(); }
});

test('kiwifruit built-in: an existing profile survives restart and application preserves lock and Library settings', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile, true);
  try {
    const existing = nativePreferences();
    existing.theme = 'dark';
    existing.ticket.layoutLocked = true;
    existing.ticket.hiddenTargets = ['group:details/review'];
    existing.revision = 12;
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await worker.evaluate(value => chrome.storage.local.set({ 'ado-customize.preferences.v11': value }), existing);
    await context.close();
    context = await launch(profile, true);
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, workspaceTicketHtml());
    await expect(popup.getByRole('button', { name: 'Workspace view', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    expect((await savedSettings(context)).ticket).toEqual(existing.ticket);
    await popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true }).click();
    await popup.getByRole('menuitemradio', { name: 'kiwifruit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    const applied = await savedSettings(context);
    expect(decodeTicketProfile(applied.ticket)).toEqual(decodeTicketProfile(defaultPreferences().ticket));
    expect(applied.ticket.layoutLocked).toBe(true);
    expect(applied.theme).toBe(existing.theme);
    expect(applied.views).toEqual(existing.views);
    await popup.getByRole('button', { name: 'Undo last Ticket change', exact: true }).click();
    expect((await savedSettings(context)).ticket).toEqual(existing.ticket);
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

for (const dialog of [false, true]) {
  test(`Workspace view: captured native shell, metadata and original controls on ${dialog ? 'dialog' : 'full page'}`, async ({}, info) => {
    const context = await launch(info.outputPath('profile'));
    try {
      const { page, popup } = await fixture(context, 'https://dev.azure.com', dialog, false, false, workspaceTicketHtml(dialog));
      await page.setViewportSize({ width: 1536, height: 825 });
      const metadata = page.getByRole('textbox', { name: 'Area', exact: true });
      const description = page.getByRole('textbox', { name: 'Description draft', exact: true });
      await description.fill('Workspace must preserve this unsaved draft.');
      const identity = await metadata.evaluateHandle(node => ({ node, parent: node.parentElement }));
      const draftIdentity = await description.evaluateHandle(node => ({ node, parent: node.parentElement }));
      const native = await page.locator('.work-item-grid').evaluate(grid => ({ width: grid.getBoundingClientRect().width, top: grid.getBoundingClientRect().top }));
      const nativePlanning = await page.locator('#sample\\.planning').evaluate(element => element.getBoundingClientRect().height);
      const font = await description.evaluate(element => getComputedStyle(element).fontSize);
      await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
      await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
      await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
      const boxes = await page.evaluate(() => {
        const grid = document.querySelector('.work-item-grid');
        const props = document.querySelector('[data-ado-ticket-ui="workspace-properties"]');
        const field = document.querySelector('[aria-label="Area"]');
        const description = document.querySelector('#sample\\.description');
        const planning = document.querySelector('#sample\\.planning');
        if (!grid || !props || !field || !description || !planning) throw new Error('Missing Workspace geometry.');
        return { grid: grid.getBoundingClientRect().toJSON(), props: props.getBoundingClientRect().toJSON(),
          field: field.getBoundingClientRect().toJSON(), description: description.getBoundingClientRect().toJSON(),
          planning: planning.getBoundingClientRect().toJSON() };
      });
      expect(boxes.grid.top).toBeLessThan(native.top);
      expect(boxes.grid.width).toBeGreaterThan(native.width - 20);
      expect(await page.locator('.work-item-form-page').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect(await description.evaluate(element => getComputedStyle(element).fontSize)).toBe(font);
      const metadataBoxes = await page.locator('[data-ado-ticket-workspace-meta]').evaluateAll(elements => elements
        .sort((a, b) => Number(a.getAttribute('data-ado-ticket-workspace-meta')) - Number(b.getAttribute('data-ado-ticket-workspace-meta')))
        .map(element => element.getBoundingClientRect().toJSON()));
      for (let index = 1; index < metadataBoxes.length; index++) expect(metadataBoxes[index]?.top).toBeGreaterThanOrEqual(metadataBoxes[index - 1]?.bottom ?? 0);
      if (!dialog) {
        expect(boxes.props.left).toBeGreaterThan(boxes.description.right);
        expect(boxes.field.left).toBeGreaterThanOrEqual(boxes.props.left);
        expect(boxes.planning.top).toBeGreaterThan(boxes.field.bottom);
        expect(boxes.planning.height).toBeLessThan(nativePlanning);
      }
      expect(await identity.evaluate(state => state.node.isConnected && state.node.parentElement === state.parent)).toBe(true);
      expect(await draftIdentity.evaluate(state => state.node.isConnected && state.node.parentElement === state.parent)).toBe(true);
      await expect(description).toHaveText('Workspace must preserve this unsaved draft.');
      const before = await savedSettings(context);
      expect(before.ticket.viewMode).toBe('workspace');
      expect(before.ticket.cardLayouts).toEqual({});
      await page.locator('.work-item-form-page').screenshot({ path: info.outputPath('workspace-captured-shell.png') });
      await page.locator('[data-native-save]').evaluate(button => button.addEventListener('click', () => button.setAttribute('data-native-clicked', 'yes')));
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('[data-native-save]')).toHaveAttribute('data-native-clicked', 'yes');
      await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
      await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toHaveCount(0);
      await expect(description).toHaveText('Workspace must preserve this unsaved draft.');
      await expect(page.locator('.work-item-grid')).not.toHaveAttribute('data-ado-ticket-manual', '');
    } finally { await context.close(); }
  });
}

test('Board-opened Workspace: native navigation does not push Properties below rail cards', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', true, false, false, boardOpenedWorkspaceHtml());
    await page.setViewportSize({ width: 1920, height: 1031 });
    await page.locator('.work-item-grid').evaluate(grid => {
      const description = grid.querySelector('#sample\\.description');
      const planning = grid.querySelector('#sample\\.planning');
      if (!description || !planning) throw new Error('Missing minimized Board navigation fixture.');
      grid.replaceChildren(description, planning);
    });
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    const geometry = await page.evaluate(() => {
      const props = document.querySelector('[data-ado-ticket-ui="workspace-properties"]');
      const metadata = [...document.querySelectorAll('[data-ado-ticket-workspace-meta]')].map(node => node.getBoundingClientRect());
      const planning = document.querySelector('#sample\\.planning');
      if (!props || !metadata.length || !planning) throw new Error('Missing native Board Properties geometry.');
      return { headingBottom: props.getBoundingClientRect().bottom, fieldTop: Math.min(...metadata.map(box => box.top)),
        fieldBottom: Math.max(...metadata.map(box => box.bottom)), cardTop: planning.getBoundingClientRect().top };
    });
    expect(geometry.fieldTop, 'Properties fields must begin beneath their heading, not below the Ticket body')
      .toBeGreaterThanOrEqual(geometry.headingBottom);
    expect(geometry.fieldTop - geometry.headingBottom).toBeLessThanOrEqual(4);
    expect(geometry.fieldBottom, 'Header metadata must not overlap or follow the Properties cards').toBeLessThanOrEqual(geometry.cardTop);
  } finally { await context.close(); }
});

test('Board-opened Workspace: native actions do not overlap the Back to Board navigation row', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', true, false, false, boardOpenedWorkspaceHtml());
    await page.setViewportSize({ width: 1920, height: 1031 });
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    const boxes = await page.evaluate(() => {
      const nav = document.querySelector('.work-item-form-nav-bar');
      const commands = document.querySelector('.work-item-header-command-bar[role="menubar"]');
      const comments = document.querySelector('.wif-comment-count-link');
      if (!nav || !commands || !comments) throw new Error('Missing native Board header geometry.');
      return { navBottom: nav.getBoundingClientRect().bottom, commandTop: commands.getBoundingClientRect().top,
        commentTop: comments.getBoundingClientRect().top };
    });
    expect(boxes.commandTop, 'Native actions must stay in the Ticket header below Board navigation').toBeGreaterThanOrEqual(boxes.navBottom);
    expect(boxes.commentTop).toBeGreaterThanOrEqual(boxes.navBottom);
  } finally { await context.close(); }
});

for (const dialog of [false, true]) {
  test(`Board-opened Workspace: full ${dialog ? 'dialog' : 'page'} geometry and native controls survive resizing, scrolling and reopen`, async ({}, info) => {
    const context = await launch(info.outputPath('profile'));
    try {
      const html = boardOpenedWorkspaceHtml(dialog)
        .replace(dialog ? '<div class="work-item-form-dialog"' : '<div class="work-item-form-page"',
          `<button type="button" data-native-open>Open Ticket</button>${dialog ? '<div hidden class="work-item-form-dialog"' : '<div hidden class="work-item-form-page"'}`)
        .replace('</style>', '.work-item-form-dialog { width:1200px!important; } #sample\\.development { min-height:480px; }</style>');
      const { page, popup } = await fixture(context, 'https://dev.azure.com', true, false, false, html);
      await page.setViewportSize({ width: 1920, height: 1031 });
      const rootSelector = dialog ? '.work-item-form-dialog' : '.work-item-form-page';
      await page.getByRole('button', { name: 'Open Ticket', exact: true }).evaluate((button, selector) => {
        button.addEventListener('click', () => document.querySelector(selector)?.removeAttribute('hidden'));
      }, rootSelector);
      await page.getByRole('button', { name: 'Open Ticket', exact: true }).click();
      await expect(popup.getByRole('searchbox', { name: 'Find a Ticket card or field' })).toBeVisible();
      const draft = page.getByRole('textbox', { name: 'Description draft', exact: true });
      const area = page.getByRole('textbox', { name: 'Area', exact: true });
      await draft.fill('Preserve the Board-opened Ticket draft.');
      const identity = await draft.evaluateHandle(node => ({ node, parent: node.parentElement }));
      const fieldIdentity = await area.evaluateHandle(node => ({ node, parent: node.parentElement }));
      const nativeNav = await page.locator('.work-item-form-nav-bar').evaluate(node => ({
        font: getComputedStyle(node).fontSize, buttonHeight: node.querySelector('button')?.getBoundingClientRect().height,
      }));
      await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
      await expect(page.locator('[data-ado-ticket-workspace-form-navigation]')).toHaveCount(1);
      const measure = () => page.evaluate(() => {
        const heading = document.querySelector('[data-ado-ticket-ui="workspace-properties"]');
        const fields = [...document.querySelectorAll('[data-ado-ticket-workspace-meta]')].map(node => node.getBoundingClientRect());
        const nav = document.querySelector('.work-item-form-nav-bar');
        const commands = document.querySelector('.work-item-header-command-bar[role="menubar"]');
        const root = document.querySelector('.work-item-form-page');
        if (!heading || !fields.length || !nav || !commands || !root) throw new Error('Missing complete Board-opened geometry.');
        const regions = [heading.getBoundingClientRect(), ...fields,
          ...[...document.querySelectorAll('[data-ado-ticket-manual-card]')].map(card => card.getBoundingClientRect())];
        const overlaps = regions.some((region, index) => regions.slice(index + 1).some(other =>
          Math.min(region.right, other.right) - Math.max(region.left, other.left) > 1 &&
          Math.min(region.bottom, other.bottom) - Math.max(region.top, other.top) > 1));
        return { gap: Math.min(...fields.map(field => field.top)) - heading.getBoundingClientRect().bottom,
          commandOffset: commands.getBoundingClientRect().top - nav.getBoundingClientRect().bottom,
          overflow: root.scrollWidth - root.clientWidth, overlaps };
      });
      await expect.poll(measure).toMatchObject({ gap: 0, commandOffset: 8, overflow: 0, overlaps: false });
      expect(await page.locator('.work-item-form-nav-bar').evaluate(node => ({
        font: getComputedStyle(node).fontSize, buttonHeight: node.querySelector('button')?.getBoundingClientRect().height,
      }))).toEqual(nativeNav);
      await page.locator(rootSelector).screenshot({ path: info.outputPath('board-opened-workspace.png') });
      const scroller = page.locator('.work-item-form-page');
      const top = await scroller.evaluate(root => {
        root.scrollTop = Math.min(200, root.scrollHeight - root.clientHeight);
        root.querySelector('.work-item-form-collapsible-header')?.classList.add('native-hover');
        return root.scrollTop;
      });
      expect(top).toBeGreaterThan(0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await scroller.evaluate(root => root.scrollTop)).toBeCloseTo(top, 0);
      await expect.poll(() => measure().then(value => value.gap)).toBe(0);
      await scroller.evaluate(root => { root.scrollTop = 0; });
      await page.setViewportSize({ width: 740, height: 1031 });
      await expect.poll(() => measure().then(value => value.gap)).toBe(0);
      await expect.poll(() => measure().then(value => value.overflow)).toBeLessThanOrEqual(1);
      await expect.poll(() => measure().then(value => value.overlaps)).toBe(false);
      expect(await identity.evaluate(state => state.node.isConnected && state.node.parentElement === state.parent)).toBe(true);
      expect(await fieldIdentity.evaluate(state => state.node.isConnected && state.node.parentElement === state.parent)).toBe(true);
      await expect(draft).toHaveText('Preserve the Board-opened Ticket draft.');
      const before = await savedSettings(context);
      await page.getByRole('button', { name: 'Save', exact: true }).evaluate(button => {
        button.addEventListener('click', () => button.setAttribute('data-native-clicked', 'yes'));
      });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('[data-native-save]')).toHaveAttribute('data-native-clicked', 'yes');
      await page.getByRole('button', { name: 'Close', exact: true }).evaluate((button, selector) => {
        button.addEventListener('click', () => document.querySelector(selector)?.setAttribute('hidden', ''));
      }, rootSelector);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.locator('[data-ado-ticket-root]')).toHaveCount(0);
      await page.setViewportSize({ width: 1920, height: 1031 });
      await page.getByRole('button', { name: 'Open Ticket', exact: true }).click();
      await expect(page.locator('[data-ado-ticket-workspace-form-navigation]')).toHaveCount(1);
      await expect.poll(measure).toMatchObject({ gap: 0, commandOffset: 8, overflow: 0, overlaps: false });
      await page.locator('.work-item-form-nav-bar').evaluate(nav => { nav.style.minHeight = '72px'; });
      await expect.poll(measure).toMatchObject({ gap: 0, commandOffset: 8, overflow: 0, overlaps: false });
      const worker = context.serviceWorkers()[0];
      if (!worker) throw new Error('Missing Board zoom test worker.');
      await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ url: 'https://dev.azure.com/*' });
        const tab = tabs[0];
        if (!tab?.id) throw new Error('Missing Board zoom test tab.');
        await chrome.tabs.setZoom(tab.id, 1.25);
      });
      await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(1.25);
      await expect.poll(measure).toMatchObject({ gap: expect.closeTo(0, 2), commandOffset: expect.closeTo(8, 2), overflow: 0, overlaps: false });
      await expect(draft).toHaveText('Preserve the Board-opened Ticket draft.');
      expect((await savedSettings(context)).ticket).toEqual(before.ticket);
      await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
      await expect(page.locator('[data-ado-ticket-workspace-form-navigation]')).toHaveCount(0);
      if (dialog) await expect(page.locator('.kanban-board')).not.toHaveAttribute('data-ado-ticket-root', '');
    } finally { await context.close(); }
  });
}

test('Workspace density: title uses available width and the header does not reserve a comment row', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, workspaceTicketHtml());
    await page.setViewportSize({ width: 1536, height: 825 });
    await page.locator('.work-item-grid').evaluate(grid => {
      const description = grid.querySelector('#sample\\.description');
      if (!description) throw new Error('Missing minimal density fixture.');
      grid.replaceChildren(description);
    });
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    const metrics = await page.evaluate(() => {
      const root = document.querySelector('.work-item-form-page');
      const title = document.querySelector('.work-item-title-textfield input');
      const commands = document.querySelector('.work-item-header-command-bar[role="menubar"]');
      const grid = document.querySelector('.work-item-grid');
      if (!root || !title || !commands || !grid) throw new Error('Missing density reproduction.');
      return { title: title.getBoundingClientRect().width, minimum: root.clientWidth - commands.getBoundingClientRect().width - 130,
        header: grid.getBoundingClientRect().top - root.getBoundingClientRect().top };
    });
    expect(metrics.title, 'A wide form must not squeeze its title into an intrinsic-width input').toBeGreaterThanOrEqual(metrics.minimum);
    expect(metrics.header, 'The compact header and navigation must fit without an extra comment-only line').toBeLessThanOrEqual(108);
  } finally { await context.close(); }
});

test('Workspace density: captured nested short fields use compact rows without shrinking native controls', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, workspaceTicketHtml());
    await page.setViewportSize({ width: 1536, height: 825 });
    const fields = page.locator('#sample\\.planning-fields > .work-item-form-control-wrapper');
    const controls = fields.locator('input');
    const identity = await page.locator('#sample\\.planning-fields').evaluateHandle(root =>
      [...root.querySelectorAll('input')].map(node => ({ node, parent: node.parentElement })));
    const original = await controls.evaluateAll(nodes => nodes.map(node => {
      if (!(node instanceof HTMLInputElement)) throw new Error('Missing native short-field input.');
      return { font: getComputedStyle(node).fontSize, height: node.getBoundingClientRect().height, value: node.value };
    }));
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    await expect(fields.locator('[data-ado-ticket-workspace-field]')).toHaveCount(2);
    const rows = await fields.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(rows[0]?.height).toBeLessThanOrEqual(40);
    expect(rows[1]?.height).toBeLessThanOrEqual(40);
    expect((rows[1]?.top ?? 0) - (rows[0]?.bottom ?? 0)).toBeLessThanOrEqual(4);
    expect(await page.locator('#sample\\.planning').evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(126);
    expect(await controls.evaluateAll(nodes => nodes.map(node => {
      if (!(node instanceof HTMLInputElement)) throw new Error('Missing native short-field input.');
      return { font: getComputedStyle(node).fontSize, height: node.getBoundingClientRect().height, value: node.value };
    }))).toEqual(original);
    expect(await identity.evaluate(items => items.length === 2 && items.every(item =>
      item.node.isConnected && item.node.parentElement === item.parent))).toBe(true);
  } finally { await context.close(); }
});

test('Workspace density: long labels and native targets remain usable on narrow and zoomed light forms', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, workspaceTicketHtml(false, false));
    const field = page.locator('#sample\\.planning-fields > .work-item-form-control-wrapper').last();
    await field.locator('label').evaluate(label => { label.textContent = 'Estimated points for the planning review'; });
    const input = field.locator('input');
    const original = await input.evaluate(node => ({
      font: getComputedStyle(node).fontSize, height: node.getBoundingClientRect().height,
    }));
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    for (const width of [960, 640]) {
      await page.setViewportSize({ width, height: 825 });
      await expect.poll(() => page.locator('.work-item-form-page').evaluate(root => root.scrollWidth - root.clientWidth)).toBeLessThanOrEqual(1);
      await expect(input).toBeVisible();
      expect(await input.evaluate(node => getComputedStyle(node).fontSize)).toBe(original.font);
      expect(await input.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(original.height);
      expect(await field.locator('label').evaluate(label => label.scrollWidth - label.clientWidth)).toBeLessThanOrEqual(1);
    }
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('Missing zoom test worker.');
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://dev.azure.com/*' });
      const tab = tabs[0];
      if (!tab?.id) throw new Error('Missing native zoom test tab.');
      await chrome.tabs.setZoom(tab.id, 1.25);
    });
    await expect.poll(() => page.locator('.work-item-form-page').evaluate(root => root.scrollWidth - root.clientWidth)).toBeLessThanOrEqual(1);
    await input.scrollIntoViewIfNeeded();
    await input.fill('8');
    await expect(input).toHaveValue('8');
    expect(await input.evaluate(node => node.getBoundingClientRect().height * window.devicePixelRatio)).toBeGreaterThanOrEqual(original.height * 1.25);
    await page.getByRole('button', { name: 'Save', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('layout reports keep readonly body content out of actual controller bindings and saved-rule diagnostics', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, workspaceTicketHtml());
    await page.locator('#sample\\.description .work-item-form-control-wrapper').evaluate(control => {
      control.removeAttribute('data-field-name');
      control.innerHTML = `<div class="work-item-form-control-content-wrapper flex-column"><div class="work-item-form-control-content show-markdown-preview">
        <label>PRIVATE_BODY_LABEL</label><p>PRIVATE_READONLY_BODY</p>
      </div></div>`;
    });
    const settings = await savedSettings(context);
    settings.ticket.hiddenTargets = ['field:label/details/description/private_readonly_body'];
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('Missing privacy test worker.');
    await worker.evaluate(value => chrome.storage.local.set({ 'ado-customize.preferences.v11': value }), settings);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await popup.getByRole('button', { name: 'Inspection details', exact: true }).click();
    const pending = popup.waitForEvent('download');
    await popup.getByRole('button', { name: 'Download layout report', exact: true }).click();
    const download = await pending;
    const file = info.outputPath('readonly-layout-report.json');
    await download.saveAs(file);
    const encoded = await readFile(file, 'utf8');
    expect(encoded).toContain('field:system.description');
    for (const text of ['PRIVATE_BODY_LABEL', 'PRIVATE_READONLY_BODY', 'private_readonly_body']) expect(encoded).not.toContain(text);
    expect(JSON.parse(encoded)).toMatchObject({ snapshots: expect.arrayContaining([expect.objectContaining({
      hiddenTargetCounts: { total: 1, recorded: 0, omitted: 1 },
    })]) });
    expect((await savedSettings(context)).ticket.hiddenTargets).toEqual(settings.ticket.hiddenTargets);
    await expect(page.getByText('PRIVATE_READONLY_BODY', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('Workspace view: scrolling survives hover reconciliation and transfers between native and Workspace owners', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const html = workspaceTicketHtml().replace('</style>', '#sample\\.review,#sample\\.development{min-height:420px;}</style>');
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, html);
    await page.setViewportSize({ width: 1536, height: 825 });
    await expect(page.getByRole('button', { name: 'Move Planning', exact: true })).toBeEnabled();
    const nativeTop = await page.locator('.work-item-form-page-content').evaluate(element => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(nativeTop).toBeGreaterThan(50);
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
    const scroller = page.locator('.work-item-form-page');
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(50);
    const bottom = await scroller.evaluate(element => {
      element.scrollTop = element.scrollHeight;
      for (const header of element.querySelectorAll('.work-item-form-collapsible-header')) {
        header.addEventListener('mouseenter', () => header.classList.add('native-hover'));
        header.addEventListener('mouseleave', () => header.classList.remove('native-hover'));
      }
      return element.scrollTop;
    });
    const header = await page.locator('#sample\\.development .work-item-form-collapsible-header').boundingBox();
    if (!header) throw new Error('Missing scrolled Workspace header.');
    for (let move = 0; move < 8; move++) {
      await page.mouse.move(move % 2 ? 4 : header.x + 8, move % 2 ? 4 : header.y + header.height / 2);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await scroller.evaluate(element => element.scrollTop)).toBeGreaterThanOrEqual(bottom - 1);
    }
    const userTop = Math.round(bottom * 0.6);
    await scroller.evaluate((element, top) => { element.scrollTop = top; element.querySelector('.work-item-title-textfield')?.classList.add('native-user-scroll'); }, userTop);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await scroller.evaluate(element => element.scrollTop)).toBeCloseTo(userTop, 0);
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(0);
    expect(await page.locator('.work-item-form-page-content').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  } finally { await context.close(); }
});

test('Workspace view: dragging, hiding, Undo, presets and lock keep the original layout independent', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, workspaceTicketHtml());
    await page.setViewportSize({ width: 1536, height: 825 });
    await dragToDevelopment(page);
    const original = (await savedSettings(context)).ticket.cardLayouts;
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await page.locator('#sample\\.planning').hover();
    const source = await page.getByRole('button', { name: 'Move Planning', exact: true }).boundingBox();
    const target = await page.locator('#sample\\.description').boundingBox();
    if (!source || !target) throw new Error('Missing Workspace drag targets.');
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 3 });
    await expect(page.getByText('Drop in column 3', { exact: true })).toHaveCount(0);
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => (await savedSettings(context)).ticket.workspaceLayouts['page:details']?.[0]).toContain('group:details/planning');
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual(original);
    await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hidden (1)', exact: true })).toHaveCount(0);
    await popup.getByRole('button', { name: 'Undo last Ticket change', exact: true }).click();
    await expect(page.locator('#sample\\.review')).toBeVisible();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Workspace');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toHaveCount(0);
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual(original);
    expect((await savedSettings(context)).ticket.layoutLocked).toBe(true);
  } finally { await context.close(); }
});

test('Workspace view: unsupported headers and unknown grid widgets remain explicit and untouched', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeActionsTicketHtml());
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(popup.getByText(/this header retains its native layout/)).toBeVisible();
    await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(0);
    await page.locator('.work-item-grid').evaluate(grid => {
      const widget = document.createElement('aside'); widget.textContent = 'Unknown native widget'; grid.append(widget);
    });
    await expect(popup.getByText(/Workspace cannot safely arrange/)).toBeVisible();
    await expect(page.getByText('Unknown native widget', { exact: true })).toBeVisible();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    expect((await savedSettings(context)).ticket.workspaceLayouts).toEqual({});
  } finally { await context.close(); }
});

test('Workspace view: v5 recovery preserves the original layout and Workspace persists across restart and hosts', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile);
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, workspaceTicketHtml());
    const original = nativePreferences();
    original.ticket.cardLayouts = { 'page:details': [['group:details/description', 'group:details/discussion'],
      ['group:details/planning', 'group:details/review'], ['group:details/development']] };
    original.ticket.hiddenTargets = ['group:details/review'];
    const legacy = JSON.parse(JSON.stringify(original));
    legacy.version = 5; delete legacy.ticket.viewMode; delete legacy.ticket.workspaceLayouts;
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('Missing settings writer.');
    await worker.evaluate(async data => {
      await chrome.storage.local.set({ 'ado-customize.preferences.v5': data });
      await chrome.storage.local.remove('ado-customize.preferences.v11');
    }, legacy);
    await page.reload();
    await page.bringToFront();
    await popup.reload();
    await expect(popup.getByRole('button', { name: 'Workspace view', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await popup.getByRole('button', { name: 'Workspace view', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual(original.ticket.cardLayouts);
    const retained = await worker.evaluate(() => chrome.storage.local.get('ado-customize.preferences.v5'));
    expect(retained).toEqual(expect.objectContaining({ 'ado-customize.preferences.v5': expect.objectContaining({ version: 5 }) }));
    await context.close();
    context = await launch(profile);
    const reopened = await fixture(context, 'https://example.visualstudio.com', false, false, false, workspaceTicketHtml());
    await expect(reopened.popup.getByRole('button', { name: 'Workspace view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(reopened.page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await expect(reopened.page.locator('#sample\\.review')).not.toBeVisible();
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual(original.ticket.cardLayouts);
    expect((await savedSettings(context)).ticket.layoutLocked).toBe(true);
  } finally { await context.close(); }
});

for (const scenario of [
  { name: 'full page', origin: 'https://dev.azure.com', dialog: false },
  { name: 'legacy dialog', origin: 'https://example.visualstudio.com', dialog: true },
]) {
  test(`Ticket visibility, presets, drafts, and automatic selection on ${scenario.name}`, async ({}, info) => {
    const context = await launch(info.outputPath('profile'));
    try {
      const { page, popup, calls } = await fixture(context, scenario.origin, scenario.dialog);
      await expect(popup.getByRole('searchbox', { name: 'Find a Ticket card or field' })).toBeVisible();
      await expect(popup.getByRole('button', { name: 'Show History', exact: true })).toBeVisible();
      await expect.poll(() => calls.length).toBe(3);
      const worker = context.serviceWorkers()[0];
      if (!worker) throw new Error('No extension worker.');
      await worker.evaluate(() => chrome.action.openPopup());
      await expect.poll(() => popup.evaluate(() => {
        const view = chrome.extension.getViews({ type: 'popup' })[0];
        const panel = view?.document.querySelector('input[aria-label="Find a Ticket card or field"]');
        const bounds = view?.document.querySelector('.popup')?.getBoundingClientRect();
        return { ticket: Boolean(panel), width: bounds?.width, height: bounds?.height };
      })).toEqual({ ticket: true, width: 340, height: 480 });
      await popup.evaluate(() => { for (const view of chrome.extension.getViews({ type: 'popup' })) view.close(); });
      expect(calls.some(url => /\/workitems\/101/.test(url))).toBe(false);
      const description = page.getByRole('textbox', { name: 'Description draft' });
      await description.fill('Draft survives every layout change');
      const handle = await description.elementHandle();

      await find(popup, 'Planning');
      await popup.getByRole('button', { name: 'Show Planning', exact: true }).click();
      await expect(page.locator('#sample\\.planning')).not.toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
      await expect(description).toHaveValue('Draft survives every layout change');

      await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
      await popup.getByRole('textbox', { name: /Preset name/ }).fill('Ticket focus');
      await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
      await expect(popup.getByRole('button', { name: 'Choose preset, current Ticket focus', exact: true })).toBeVisible();
      await popup.getByRole('button', { name: 'Show all', exact: true }).click();
      await expect(page.locator('#sample\\.planning')).toBeVisible();
      await popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true }).click();
      await popup.getByRole('menuitemradio', { name: 'Ticket focus', exact: true }).click();
      await expect(page.locator('#sample\\.planning')).not.toBeVisible();

      await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
      await expect(page.locator('#sample\\.planning')).toBeVisible();
      await expect(page.locator('[data-ado-ticket-root]')).toHaveCount(0);
      await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
      await expect(page.locator('#sample\\.planning')).not.toBeVisible();
      expect(await handle?.evaluate(element => element.isConnected)).toBe(true);
      await expect(description).toHaveValue('Draft survives every layout change');

      await popup.getByRole('button', { name: 'Show all', exact: true }).click();
      await find(popup, 'Priority');
      await popup.getByRole('button', { name: 'Show Priority', exact: true }).click();
      const priority = page.locator('[data-field-name="Microsoft.VSTS.Common.Priority"]');
      await expect(priority).not.toBeVisible();
      await find(popup, 'Planning');
      await popup.getByRole('button', { name: 'Show Planning', exact: true }).click();
      await expect(page.locator('#sample\\.planning')).not.toBeVisible();
      await popup.getByRole('button', { name: 'Show Planning', exact: true }).click();
      await expect(page.locator('#sample\\.planning')).toBeVisible();
      await expect(priority).not.toBeVisible();

      await page.locator('[aria-label="Priority value"]').evaluate(element => element.setAttribute('aria-invalid', 'true'));
      await expect(priority).toBeVisible();
      await find(popup, 'Priority');
      await expect(popup.getByText('Shown for validation', { exact: true }).first()).toBeVisible();

      await find(popup, 'History');
      await popup.getByRole('button', { name: 'Show History', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'History', exact: true })).not.toBeVisible();
      await find(popup, 'Details');
      await popup.getByRole('button', { name: 'Show Details', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Details', exact: true })).toBeVisible();
      await expect(popup.getByText('Will hide after leaving this page', { exact: true })).toBeVisible();
      await expect(description).toHaveValue('Draft survives every layout change');
      await popup.getByRole('button', { name: 'Show all', exact: true }).click();

      await popup.getByRole('button', { name: 'Library', exact: true }).click();
      await expect(popup.getByRole('heading', { name: 'Board layout', exact: true })).toBeVisible();
      await page.locator('#sample\\.planning').evaluate(element => element.classList.add('rerender-check'));
      await expect(popup.getByRole('heading', { name: 'Board layout', exact: true })).toBeVisible();
      await popup.getByRole('button', { name: 'Ticket', exact: true }).click();
      await find(popup, 'Description');
      await popup.getByRole('button', { name: 'Show Description', exact: true }).first().click();
      await expect(page.locator('#sample\\.description')).not.toBeVisible();
      const width = await page.locator('.work-item-form-page').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
      await popup.locator('.popup').screenshot({ path: info.outputPath('ticket-popup.png') });
      await popup.close();
      await expect(page.locator('#sample\\.description')).not.toBeVisible();
      await page.reload();
      await expect(page.locator('#sample\\.description')).not.toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('a form without a type attribute opens the native page hierarchy without a type chooser', async ({}, info) => {
    const context = await launch(info.outputPath('profile'));
    try {
      const { popup, page, calls } = await fixture(context, 'https://dev.azure.com', false, false, true);
      await expect(popup.getByRole('button', { name: 'Show Scans', exact: true })).toBeVisible();
      await expect(popup.getByRole('button', { name: 'Show Team', exact: true })).toBeVisible();
      await expect(popup.getByRole('button', { name: 'Show Exception Handling', exact: true })).toBeVisible();
      await expect(popup.getByRole('combobox', { name: 'Form type', exact: true })).toHaveCount(0);
      await expect(popup.getByText('The form type was not identified. Showing detected cards only.', { exact: true })).toHaveCount(0);
      await popup.locator('.popup').screenshot({ path: info.outputPath('native-page-hierarchy.png') });
      await popup.getByRole('button', { name: 'Details', exact: true }).click();
      await expect(popup.getByRole('button', { name: 'Description', exact: true })).toBeVisible();
      await popup.getByRole('button', { name: 'Planning', exact: true }).click();
      await expect(popup.getByRole('button', { name: 'Show Story Points', exact: true })).toBeVisible();
      await expect(popup.getByRole('button', { name: 'Show Priority', exact: true })).toBeVisible();
      expect(calls.some(url => /\/workitems\/101/.test(url))).toBe(false);
      await popup.getByRole('button', { name: 'Details', exact: true }).click();
      await expect(popup.getByRole('button', { name: 'Show Priority', exact: true })).not.toBeVisible();
      await expect(popup.getByRole('button', { name: 'Show Scans', exact: true })).toBeVisible();
      await popup.getByRole('button', { name: 'Details', exact: true }).click();
      await popup.getByRole('button', { name: 'Show Priority', exact: true }).click();
      await expect(page.locator('[data-field-name="Microsoft.VSTS.Common.Priority"]')).not.toBeVisible();
      await popup.getByRole('button', { name: 'Refresh ticket count', exact: true }).click();
      await expect(popup.getByRole('button', { name: 'Planning', exact: true })).toHaveAttribute('aria-expanded', 'true');
      await expect(popup.getByRole('button', { name: 'Show Priority', exact: true })).toBeVisible();
    } finally { await context.close(); }
});

test('Ticket preset choices do not include Library presets', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup } = await fixture(context, 'https://dev.azure.com', false);
    await expect(popup.getByRole('searchbox', { name: 'Find a Ticket card or field' })).toBeVisible();
    await popup.getByRole('button', { name: /Choose preset, current/ }).click();
    await expect(popup.getByRole('menuitemradio', { name: /Focus/ })).toHaveCount(0);
    await expect(popup.getByRole('menuitemradio', { name: /Compact/ })).toHaveCount(0);
    await expect(popup.getByText('Library only', { exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test('Ticket and Library save the same name in separate preset menus', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false);
    await expect(popup.getByRole('searchbox', { name: 'Find a Ticket card or field' })).toBeVisible();
    await popup.getByRole('button', { name: 'Library', exact: true }).click();
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Daily');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Daily', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Ticket', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true })).toBeVisible();
    await find(popup, 'Planning');
    await popup.getByRole('button', { name: 'Show Planning', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('combobox', { name: 'Save into', exact: true }).selectOption('');
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Daily');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Daily', exact: true })).toBeVisible();
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    const settings = await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get('ado-customize.preferences.v11');
      return stored['ado-customize.preferences.v11'];
    });
    const { decodePreferences } = await import('../../lib/preferences');
    const decoded = decodePreferences(settings);
    expect(decoded.savedPresets.map(preset => preset.name)).toEqual(['Daily']);
    expect(decoded.ticket.savedPresets.map(preset => preset.name)).toEqual(['Daily']);
    expect(decoded.savedPresets[0]?.ticket).toBeUndefined();
    expect(decoded.ticket.savedPresets[0]?.appearance).toBeUndefined();
  } finally { await context.close(); }
});

test('hiding a card closes fixed native row gaps', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const draft = page.getByRole('textbox', { name: 'Review draft' });
    await draft.fill('Keep this unsaved draft');
    const original = await draft.elementHandle();
    const rowGap = () => page.locator('#sample\\.review').evaluate(card =>
      card.getBoundingClientRect().top - (card.parentElement?.getBoundingClientRect().top ?? 0));
    expect(await rowGap()).toBe(320);
    await find(popup, 'Planning');
    await popup.getByRole('button', { name: 'Show Planning', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    await expect(page.locator('#sample\\.review')).toBeVisible();
    await page.screenshot({ path: info.outputPath('hidden-card-layout.png') });
    expect(await rowGap(), 'Review must move into the row vacated by Planning').toBeLessThanOrEqual(1);
    expect(await original?.evaluate(element => element.isConnected)).toBe(true);
    await expect(draft).toHaveValue('Keep this unsaved draft');
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-root]')).toHaveCount(0);
    expect(await rowGap()).toBe(320);
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    expect(await rowGap()).toBeLessThanOrEqual(1);
    await popup.getByRole('button', { name: 'Show all', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).toBeVisible();
    expect(await rowGap()).toBe(320);
    await expect(page.locator('[data-ado-ticket-stack], [data-ado-ticket-flow-item]')).toHaveCount(0);
    await expect(draft).toHaveValue('Keep this unsaved draft');
  } finally { await context.close(); }
});

for (const scenario of [{ name: 'full page', dialog: false }, { name: 'dialog', dialog: true }]) {
test(`hiding an entire native column fills its reserved track on ${scenario.name}`, async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', scenario.dialog, false, false, ticketHtml(scenario.dialog, true));
    for (const name of ['Planning', 'Review']) {
      await find(popup, name);
      await popup.getByRole('button', { name: `Show ${name}`, exact: true }).click();
    }
    await expect(page.locator('#sample\\.primary-column')).not.toBeVisible();
    const sizes = await page.locator('#sample\\.secondary-column').evaluate(column => ({
      left: column.getBoundingClientRect().left - (column.parentElement?.getBoundingClientRect().left ?? 0),
      width: column.getBoundingClientRect().width,
      available: column.parentElement?.getBoundingClientRect().width ?? 0,
    }));
    expect(sizes.left, 'The surviving column must occupy the first track').toBeLessThanOrEqual(1);
    expect(sizes.width, 'The surviving column must fill the available width').toBeGreaterThanOrEqual(sizes.available - 1);
    for (const name of ['Description', 'Discussion']) {
      await find(popup, name);
      await popup.getByRole('button', { name: `Show ${name}`, exact: true }).first().click();
    }
    await expect(page.locator('.work-item-form-first-section')).not.toBeVisible();
    await expect(page.locator('.work-item-form-discussion')).not.toBeVisible();
    const filled = await page.locator('.work-item-form-right').evaluate(rail => ({
      left: rail.getBoundingClientRect().left - (rail.parentElement?.getBoundingClientRect().left ?? 0),
      width: rail.getBoundingClientRect().width,
      available: rail.parentElement?.getBoundingClientRect().width ?? 0,
    }));
    expect(filled.left).toBeLessThanOrEqual(1);
    expect(filled.width).toBeGreaterThanOrEqual(filled.available - 1);
    await page.setViewportSize({ width: 640, height: 800 });
    await expect.poll(() => page.locator('.work-item-form-page').evaluate(form => form.scrollWidth - form.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('reflow-narrow.png') });
  } finally { await context.close(); }
});
}

test('hiding a field closes fixed native field row gaps', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await find(popup, 'Priority');
    await popup.getByRole('button', { name: 'Show Priority', exact: true }).click();
    const points = page.locator('[data-field-name="Microsoft.VSTS.Scheduling.StoryPoints"]');
    await expect(points).toBeVisible();
    const gap = await points.evaluate(field =>
      field.getBoundingClientRect().top - (field.parentElement?.getBoundingClientRect().top ?? 0));
    expect(gap, 'The remaining field must fill the hidden field row').toBeLessThanOrEqual(8);
  } finally { await context.close(); }
});

test('column collapse preserves unmapped native content', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await page.locator('#sample\\.primary-column').evaluate(column => {
      const widget = document.createElement('aside');
      widget.textContent = 'Unmapped native region';
      column.append(widget);
    });
    for (const name of ['Planning', 'Review']) {
      await find(popup, name);
      await popup.getByRole('button', { name: `Show ${name}`, exact: true }).click();
    }
    await expect(page.getByText('Unmapped native region', { exact: true })).toBeVisible();
    await expect(page.locator('#sample\\.primary-column')).toBeVisible();
  } finally { await context.close(); }
});

test('reflow preserves native conditional field visibility', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await page.locator('.work-item-form-page').evaluate(form => { form.style.height = '800px'; });
    const points = page.locator('[data-field-name="Microsoft.VSTS.Scheduling.StoryPoints"]');
    await points.evaluate(field => {
      const holder = document.createElement('div');
      holder.id = 'conditional-field';
      holder.style.display = 'none';
      field.before(holder);
      holder.append(field);
    });
    await find(popup, 'Priority');
    await popup.getByRole('button', { name: 'Show Priority', exact: true }).click();
    await expect(points).not.toBeVisible();
    await page.locator('#conditional-field').evaluate(holder => {
      holder.style.display = 'grid';
      holder.style.gridTemplateRows = '200px auto';
      const field = holder.querySelector<HTMLElement>('.work-item-form-control-wrapper');
      if (!field) throw new Error('Missing conditional field.');
      field.style.gridRow = '2';
    });
    await expect(points).toBeVisible();
    await expect.poll(() => points.evaluate(field =>
      field.getBoundingClientRect().top - (field.parentElement?.getBoundingClientRect().top ?? 0))).toBeLessThanOrEqual(8);
  } finally { await context.close(); }
});

test('reflow does not reveal a natively hidden side region', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const rail = page.locator('.work-item-form-right');
    await rail.evaluate(region => { region.style.display = 'none'; });
    await find(popup, 'Description');
    await popup.getByRole('button', { name: 'Show Description', exact: true }).first().click();
    await expect(rail).not.toBeVisible();
  } finally { await context.close(); }
});

test('native hover handle moves a card across grid columns without reparenting editors', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const planning = page.locator('#sample\\.planning');
    const draft = page.getByRole('textbox', { name: 'Development draft' });
    await draft.fill('Keep this native draft');
    const probe = await planning.evaluateHandle(card => {
      const parent = card.parentElement;
      if (!parent) throw new Error('Missing native card parent.');
      const state = { card, parent, moved: false, observer: new MutationObserver(() => {}) };
      state.observer = new MutationObserver(changes => {
        if (changes.some(change => [...change.removedNodes].some(node => node === card || node.contains(card)))) state.moved = true;
      });
      state.observer.observe(parent, { childList: true, subtree: true });
      return state;
    });
    await page.mouse.move(1250, 700);
    await expect(planning.locator('ado-ticket-drag-handle')).toHaveCSS('opacity', '0');
    await planning.hover();
    await expect(planning.locator('ado-ticket-drag-handle')).toHaveCSS('opacity', '1');
    const handle = page.getByRole('button', { name: 'Move Planning', exact: true });
    await expect(handle).toBeVisible();
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const geometry = await planning.evaluate(card => {
      const other = document.getElementById('sample.development');
      if (!other) throw new Error('Missing drop target.');
      return { x: card.getBoundingClientRect().x - other.getBoundingClientRect().x,
        y: card.getBoundingClientRect().y - other.getBoundingClientRect().bottom };
    });
    expect(Math.abs(geometry.x)).toBeLessThanOrEqual(1);
    expect(geometry.y).toBeGreaterThanOrEqual(15);
    expect(await probe.evaluate(state => ({ moved: state.moved, sameParent: state.card.parentElement === state.parent,
      sameCard: document.getElementById('sample.planning') === state.card }))).toEqual({ moved: false, sameParent: true, sameCard: true });
    await probe.evaluate(state => state.observer.disconnect());
    await expect(draft).toHaveValue('Keep this native draft');
    await expect(popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('manual-card-grid.png') });
    await draft.evaluate(element => { element.style.height = '180px'; });
    await expect.poll(() => planning.evaluate(card => {
      const other = document.getElementById('sample.development');
      if (!other) throw new Error('Missing resized card.');
      return card.getBoundingClientRect().top - other.getBoundingClientRect().bottom;
    })).toBe(16);
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Reordered');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Reordered', exact: true })).toBeVisible();
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await popup.getByRole('button', { name: 'Show all', exact: true }).click();
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(page.locator('#sample\\.review')).toBeVisible();
    await popup.getByRole('button', { name: 'Reset layout', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await expect(draft).toHaveValue('Keep this native draft');
    await popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true }).click();
    await popup.getByRole('menuitemradio', { name: 'Reordered', exact: true }).click();
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
  } finally { await context.close(); }
});

test('hand controls share the actual native header action row without shifting existing buttons', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeActionsTicketHtml(true));
    const card = page.locator('#sample\\.planning');
    await card.hover();
    const native = card.getByRole('button', { name: 'Edit Planning', exact: true });
    const grip = card.getByRole('button', { name: 'Move Planning', exact: true });
    const identity = await native.evaluateHandle(button => ({ button, parent: button.parentElement }));
    await expect(card.locator('.work-item-form-section-controls > ado-ticket-drag-handle')).toHaveCount(1);
    const geometry = await grip.evaluate(button => {
      const tree = button.getRootNode();
      if (!(tree instanceof ShadowRoot) || !tree.host.parentElement) throw new Error('Missing native action row.');
      const controls = tree.host.parentElement;
      const edit = controls.querySelector('button[aria-label="Edit Planning"]');
      if (!edit) throw new Error('Native edit action disappeared.');
      const hand = button.getBoundingClientRect();
      const other = edit.getBoundingClientRect();
      const header = controls.closest('.work-item-form-collapsible-header');
      if (!header) throw new Error('Missing native card header.');
      return { gap: hand.left - other.right, center: hand.top + hand.height / 2 - other.top - other.height / 2,
        count: controls.querySelectorAll(':scope > button').length,
        overflow: hand.right - header.getBoundingClientRect().right };
    });
    expect(geometry.count).toBe(4);
    expect(geometry.gap).toBeGreaterThanOrEqual(3);
    expect(geometry.gap).toBeLessThanOrEqual(8);
    expect(Math.abs(geometry.center)).toBeLessThanOrEqual(1);
    const title = card.locator('[data-ado-ticket-header-title]');
    await expect.poll(() => title.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(60);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(await identity.evaluate(state => state.button.isConnected && state.button.parentElement === state.parent)).toBe(true);
    await page.screenshot({ path: info.outputPath('native-aligned-actions.png') });
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(card.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await expect(card.locator('[data-ado-ticket-header-actions]')).toHaveCount(0);
  } finally { await context.close(); }
});

test('drag feedback highlights the source and updates before-after preview within one target', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml(true));
    const sourceCard = page.locator('#sample\\.planning');
    await sourceCard.hover();
    const hand = await page.getByRole('button', { name: 'Move Planning', exact: true }).boundingBox();
    const target = await page.locator('#sample\\.development').boundingBox();
    if (!hand || !target) throw new Error('Missing preview geometry.');
    await page.mouse.move(hand.x + hand.width / 2, hand.y + hand.height / 2);
    await page.mouse.down();
    await page.mouse.move(hand.x + hand.width / 2 + 12, hand.y + hand.height / 2, { steps: 3 });
    await expect(sourceCard).toHaveAttribute('data-ado-ticket-drag-source', '');
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.2, { steps: 8 });
    const preview = page.locator('[data-ado-ticket-ui="drop-preview"]');
    await expect(preview).toContainText('before Development');
    await expect(page.locator('#sample\\.development')).toHaveAttribute('data-ado-ticket-drop', 'before');
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, { steps: 8 });
    await expect(preview).toContainText('after Development');
    await expect(page.locator('#sample\\.development')).toHaveAttribute('data-ado-ticket-drop', 'after');
    await page.screenshot({ path: info.outputPath('live-card-drop-preview.png') });
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    await expect(sourceCard).not.toHaveAttribute('data-ado-ticket-drag-source', '');
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect.poll(() => sourceCard.evaluate(card => {
      const other = document.getElementById('sample.development');
      return other ? card.getBoundingClientRect().top - other.getBoundingClientRect().bottom : -1;
    })).toBeGreaterThanOrEqual(15);
  } finally { await context.close(); }
});

test('long native headings leave room for every action without revealing hidden native controls', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeActionsTicketHtml());
    const card = page.locator('#sample\\.planning');
    await card.evaluate(node => { node.style.width = '220px'; });
    const title = card.locator('.work-item-form-collapsible-header > [role="heading"]');
    await title.evaluate(node => { node.textContent = 'Planning and delivery details for a long native heading'; });
    await card.hover();
    const controls = card.locator('.work-item-form-section-controls');
    await expect(controls.locator('ado-ticket-drag-handle')).toHaveCount(1);
    await expect.poll(() => card.locator('.work-item-form-collapsible-header').evaluate(header =>
      header.scrollWidth - header.clientWidth)).toBeLessThanOrEqual(1);
    await expect(controls.locator(':scope > button')).toHaveCount(4);
    await expect.poll(() => title.evaluate(node => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
    await controls.evaluate(node => { node.style.display = 'none'; });
    await expect(controls).not.toBeVisible();
    await expect(card.locator('.work-item-form-collapsible-header > [data-ado-ticket-ui="card-actions"] > ado-ticket-drag-handle')).toHaveCount(1);
    await controls.evaluate(node => { node.style.removeProperty('display'); });
    await expect(controls.locator('ado-ticket-drag-handle')).toHaveCount(1);
    await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
    await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(0);
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await expect.poll(() => card.locator('.work-item-form-collapsible-header').evaluate(header =>
      header.scrollWidth - header.clientWidth)).toBeLessThanOrEqual(1);
    await expect(controls.locator(':scope > button')).toHaveCount(4);
    await controls.evaluate(node => { node.style.display = 'none'; });
    await expect(controls).not.toBeVisible();
    await expect(page.locator('[data-ado-ticket-ui="card-actions"]')).toHaveCount(0);
    await controls.evaluate(node => { node.style.removeProperty('display'); });
    await popup.getByRole('button', { name: 'Unlock layout', exact: true }).click();
    await expect(controls.locator('ado-ticket-drag-handle')).toHaveCount(1);
  } finally { await context.close(); }
});

test('column landing hints match the saved end position and Escape clears all feedback', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false);
    const card = page.locator('#sample\\.planning');
    const handle = page.getByRole('button', { name: 'Move Planning', exact: true });
    await card.hover();
    const bounds = await handle.boundingBox();
    if (!bounds) throw new Error('Missing column-drag handle.');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 12, bounds.y + bounds.height / 2, { steps: 3 });
    const lane = page.getByText('Drop in column 3', { exact: true });
    await expect(lane).toBeVisible();
    const target = await lane.boundingBox();
    if (!target) throw new Error('Missing empty-column drop zone.');
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await expect(page.locator('[data-ado-ticket-ui="drop-preview"]')).toContainText('end of column 3');
    await page.mouse.up();
    await expect(page.locator('[data-ado-ticket-ui="drop-preview"]')).toHaveCount(0);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    const before = await worker.evaluate(() => chrome.storage.local.get('ado-customize.preferences.v11'));
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(card).toHaveAttribute('data-ado-ticket-drag-source', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ado-ticket-ui="drop-preview"]')).toHaveCount(0);
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"]')).toHaveCount(0);
    await expect(card).not.toHaveAttribute('data-ado-ticket-drag-source', '');
    expect(await worker.evaluate(() => chrome.storage.local.get('ado-customize.preferences.v11'))).toEqual(before);
  } finally { await context.close(); }
});

test('native background updates do not flash unhovered hand controls', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml());
    await page.bringToFront();
    await page.mouse.move(1250, 700);
    const handles = page.locator('ado-ticket-drag-handle');
    await expect(handles).toHaveCount(3);
    await expect(handles.first()).toHaveCSS('opacity', '0');
    const peak = await page.evaluate(async () => {
      const heartbeat = document.createElement('div');
      Object.assign(heartbeat.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', pointerEvents: 'none' });
      document.body.append(heartbeat);
      let maximum = 0;
      for (let frame = 0; frame < 8; frame++) {
        heartbeat.style.opacity = frame % 2 ? '0.1' : '0.2';
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        for (const handle of document.querySelectorAll('ado-ticket-drag-handle')) {
          maximum = Math.max(maximum, Number(getComputedStyle(handle).opacity));
        }
      }
      heartbeat.remove();
      return maximum;
    });
    expect(peak).toBeLessThanOrEqual(0.02);
  } finally { await context.close(); }
});

test('a flex-constrained native form does not collapse its manual grid width', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const html = nativeTicketHtml().replace('</style>', `
      .work-item-form-page { display: flex; flex-direction: column; align-items: flex-start; }
      .work-item-grid { width: 100%; }
      .work-item-form-first-section > .work-item-form-section { display: flex; flex-direction: column; }
      </style>`);
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, html);
    await page.locator('.work-item-form-first-section').evaluate(region => {
      const section = document.createElement('div');
      section.className = 'work-item-form-section';
      while (region.firstChild) section.append(region.firstChild);
      region.append(section);
    });
    const grid = page.locator('.work-item-grid');
    const nativeWidth = await grid.evaluate(node => node.getBoundingClientRect().width);
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await expect.poll(() => grid.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(nativeWidth * 0.95);
    await dragToDevelopment(page);
    await expect(grid).toHaveAttribute('data-ado-ticket-manual', '');
    await expect.poll(() => grid.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(nativeWidth * 0.95);
    await expect.poll(() => page.locator('#sample\\.description').evaluate(card => card.getBoundingClientRect().width)).toBeGreaterThanOrEqual(480);
  } finally { await context.close(); }
});

test('a hovered manual handle stays visible during native form updates', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml());
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const handle = page.getByRole('button', { name: 'Move Planning', exact: true });
    await handle.hover();
    await expect(page.locator('#sample\\.planning ado-ticket-drag-handle')).toHaveCSS('opacity', '1');
    const minimum = await page.evaluate(async () => {
      const label = document.querySelector('[data-field-name="Microsoft.VSTS.Common.Priority"] label');
      const host = document.querySelector('#sample\\.planning ado-ticket-drag-handle');
      if (!label || !host) throw new Error('Missing native hover fixture.');
      let opacity = 1;
      for (let frame = 0; frame < 12; frame++) {
        label.classList.toggle('native-pulse');
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        opacity = Math.min(opacity, Number(getComputedStyle(host).opacity));
      }
      return opacity;
    });
    expect(minimum).toBeGreaterThanOrEqual(0.98);
  } finally { await context.close(); }
});

test('hand and visibility icons contrast with the native ADO theme independently of the popup theme', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml(true));
    const planning = page.locator('#sample\\.planning');
    const handle = page.getByRole('button', { name: 'Move Planning', exact: true });
    await planning.hover();
    await expect(handle).toBeEnabled();
    const eye = page.getByRole('button', { name: 'Hide Planning', exact: true });
    const contrast = (button = handle, paint: 'stroke' | 'fill' = 'stroke') => button.locator('svg').evaluate((svg, paint) => {
      const root = svg.getRootNode();
      if (!(root instanceof ShadowRoot) || !root.host.parentElement) throw new Error('Missing native header.');
      const luminance = (color: string) => {
        const channels = color.match(/^rgba?\((\d+), (\d+), (\d+)/);
        if (!channels) throw new Error(`Unexpected computed color: ${color}`);
        const linear = channels.slice(1, 4).map(channel => {
          const value = Number(channel) / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
      };
      const header = root.host.closest('.work-item-form-collapsible-header');
      if (!header) throw new Error('Missing native painted header.');
      const foreground = luminance(getComputedStyle(svg)[paint]);
      const background = luminance(getComputedStyle(header).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    }, paint);
    await expect.poll(() => contrast()).toBeGreaterThanOrEqual(3);
    await expect.poll(() => contrast(eye, 'fill')).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: info.outputPath('native-dark-hand.png') });
    await popup.getByRole('button', { name: 'Switch popup to dark theme', exact: true }).click();
    await page.locator('body').evaluate(body => { body.classList.replace('native-dark', 'native-light'); });
    await planning.hover();
    await expect.poll(() => contrast()).toBeGreaterThanOrEqual(3);
    await expect.poll(() => contrast(eye, 'fill')).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: info.outputPath('native-light-hand.png') });
    await page.locator('body').evaluate(body => { body.classList.replace('native-light', 'native-dark'); });
    await handle.focus();
    await expect(planning.locator('ado-ticket-drag-handle')).toHaveCSS('opacity', '1');
    await expect.poll(() => contrast()).toBeGreaterThanOrEqual(3);
    await expect.poll(() => contrast(eye, 'fill')).toBeGreaterThanOrEqual(3);
  } finally { await context.close(); }
});

test('manual movement preserves native Description width and flex rich-text editing height', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml());
    await page.setViewportSize({ width: 1600, height: 1000 });
    const description = page.locator('#sample\\.description');
    const editor = page.getByRole('textbox', { name: 'Description draft' });
    const original = await editor.elementHandle();
    await editor.fill('This rich-text draft must remain readable after dragging.');
    const before = await editor.boundingBox();
    const beforeCard = await description.boundingBox();
    if (!before || !beforeCard) throw new Error('Missing original native editor geometry.');
    expect(before.height).toBeGreaterThan(250);
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const after = await editor.boundingBox();
    const afterCard = await description.boundingBox();
    if (!after || !afterCard) throw new Error('Missing moved editor geometry.');
    expect.soft(afterCard.width).toBeGreaterThanOrEqual(beforeCard.width * 0.95);
    expect.soft(after.height).toBeGreaterThanOrEqual(before.height * 0.95);
    await expect(editor).toHaveText('This rich-text draft must remain readable after dragging.');
    expect(await original?.evaluate(node => node === document.querySelector('.rooster-editor') && node.isConnected)).toBe(true);
    await page.screenshot({ path: info.outputPath('native-rich-text-arrangement.png') });
    await page.setViewportSize({ width: 940, height: 1000 });
    await expect.poll(() => description.evaluate(card => card.getBoundingClientRect().width)).toBeGreaterThanOrEqual(480);
    await expect.poll(() => editor.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(250);
    await expect.poll(() => page.locator('.work-item-form-page').evaluate(form => form.scrollWidth - form.clientWidth)).toBeLessThanOrEqual(1);
    await popup.getByRole('button', { name: 'Reset layout', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await expect(editor).toHaveText('This rich-text draft must remain readable after dragging.');
  } finally { await context.close(); }
});

test('moving Description into a side column carries its readable editor footprint', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml());
    await page.setViewportSize({ width: 1400, height: 1000 });
    const description = page.locator('#sample\\.description');
    const editor = page.getByRole('textbox', { name: 'Description draft' });
    await editor.fill('The moved rich-text draft stays visible.');
    const original = await description.evaluateHandle(card => ({ card, parent: card.parentElement }));
    await dragToDevelopment(page, 'Description');
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect.poll(() => description.evaluate(card => card.getBoundingClientRect().width)).toBeGreaterThanOrEqual(480);
    await expect.poll(() => editor.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(250);
    await expect.poll(() => description.evaluate(card => {
      const target = document.getElementById('sample.development');
      if (!target) throw new Error('Missing side-column target.');
      return Math.abs(card.getBoundingClientRect().left - target.getBoundingClientRect().left);
    })).toBeLessThanOrEqual(1);
    expect(await original.evaluate(state => state.card.isConnected && state.card.parentElement === state.parent)).toBe(true);
    await expect(editor).toHaveText('The moved rich-text draft stays visible.');
    await page.screenshot({ path: info.outputPath('description-moved-to-side.png') });
    await page.setViewportSize({ width: 1040, height: 1000 });
    await expect.poll(() => description.evaluate(card => card.getBoundingClientRect().width)).toBeGreaterThanOrEqual(900);
    await expect.poll(() => editor.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(250);
    await expect.poll(() => page.locator('.work-item-form-page').evaluate(form => form.scrollWidth - form.clientWidth)).toBeLessThanOrEqual(1);
  } finally { await context.close(); }
});

test('hiding a rich-text field releases its reserved height in a manually arranged card', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml());
    await page.locator('#sample\\.description').evaluate(card => {
      const control = document.createElement('div');
      control.className = 'work-item-form-control-wrapper';
      control.setAttribute('data-field-name', 'Custom.DescriptionContext');
      const label = document.createElement('label');
      label.className = 'work-item-control-label';
      label.textContent = 'Context';
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Context value');
      input.value = 'Keep context';
      control.append(label, input);
      card.append(control);
    });
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await find(popup, 'Description');
    await popup.getByRole('button', { name: 'Show Description', exact: true }).last().click();
    await expect(page.getByRole('textbox', { name: 'Description draft' })).not.toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Context value' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Context value' })).toHaveValue('Keep context');
    await expect.poll(() => page.locator('#sample\\.description').evaluate(card => card.getBoundingClientRect().height)).toBeLessThan(160);
    await popup.getByRole('button', { name: 'Show Description', exact: true }).last().click();
    await expect(page.getByRole('textbox', { name: 'Description draft' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Context value' })).toHaveValue('Keep context');
  } finally { await context.close(); }
});

test('keyboard card movement persists across restart and Escape cancels a new move', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile);
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const handle = page.getByRole('button', { name: 'Move Planning', exact: true });
    await expect(handle).toBeEnabled();
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"]')).toBeVisible();
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#sample\\.development')).toHaveAttribute('data-ado-ticket-drop', /before|after/);
    await page.keyboard.press('Space');
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect.poll(() => page.locator('#sample\\.planning').evaluate(card => {
      const target = document.getElementById('sample.development');
      return target ? Math.abs(card.getBoundingClientRect().x - target.getBoundingClientRect().x) : -1;
    })).toBeLessThanOrEqual(1);
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    const storedLayout = () => worker.evaluate(async () => {
      const result = await chrome.storage.local.get('ado-customize.preferences.v11');
      return result['ado-customize.preferences.v11'];
    });
    const before = await storedLayout();
    await expect(handle).toBeEnabled();
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"]')).toBeVisible();
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-ado-ticket-drop]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"]')).toHaveCount(0);
    expect(await storedLayout()).toEqual(before);
    await context.close();
    context = await launch(profile);
    const reopened = await fixture(context, 'https://example.visualstudio.com', true, false, false, ticketHtml(true, true));
    await expect(reopened.page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await reopened.page.setViewportSize({ width: 640, height: 800 });
    await expect.poll(() => reopened.page.locator('.work-item-form-page').evaluate(form => form.scrollWidth - form.clientWidth)).toBeLessThanOrEqual(1);
    await reopened.page.screenshot({ path: info.outputPath('manual-grid-dialog-narrow.png') });
  } finally { await context.close(); }
});

test('failed card saves keep the native layout and permit a later retry', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await expect(page.getByRole('button', { name: 'Move Planning', exact: true })).toBeEnabled();
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    await worker.evaluate(async () => {
      const used = await chrome.storage.local.getBytesInUse(null);
      const key = 'drag-quota';
      await chrome.storage.local.set({ [key]: 'x'.repeat(10 * 1024 * 1024 - used - key.length - 40) });
    });
    await dragToDevelopment(page);
    await expect(page.getByRole('alert')).toContainText(/quota|QUOTA/i);
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await worker.evaluate(() => chrome.storage.local.remove('drag-quota'));
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { await context.close(); }
});

test('native page changes cancel an active drag and unknown content disables manual layout', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const handle = page.getByRole('button', { name: 'Move Planning', exact: true });
    await expect(handle).toBeEnabled();
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"]')).toBeVisible();
    await page.locator('#sample\\.team').evaluate(tab => {
      for (const other of document.querySelectorAll('[role="tab"]')) other.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-selected', 'true');
    });
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await page.locator('#sample\\.details').evaluate(tab => {
      for (const other of document.querySelectorAll('[role="tab"]')) other.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-selected', 'true');
    });
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await page.locator('#sample\\.primary-column').evaluate(column => {
      const widget = document.createElement('aside');
      widget.textContent = 'Unmapped native region';
      column.append(widget);
    });
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await expect(page.getByText('Unmapped native region', { exact: true })).toBeVisible();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
  } finally { await context.close(); }
});

test('a blocked native grid reports missing handles with content-free structural diagnostics', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const html = ticketHtml(false, true).replace('<div class="work-item-grid">',
      '<div class="work-item-grid"><aside class="bolt-region confidential-schema">Private unmapped region</aside>');
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, html);
    await expect(popup.getByRole('searchbox', { name: 'Find a Ticket card or field' })).toBeVisible();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await popup.getByRole('button', { name: 'Inspection details', exact: true }).click();
    const diagnostics = popup.getByLabel('Inspection diagnostics', { exact: true });
    await expect(diagnostics).toContainText('"status": "blocked"');
    await expect(diagnostics).toContainText('"safeGrids": 0');
    await expect(diagnostics).toContainText('"mountedHandles": 0');
    await expect(diagnostics).toContainText('"bolt-region"');
    await expect(diagnostics).not.toContainText('Private unmapped region');
    await expect(diagnostics).not.toContainText('confidential-schema');
    await expect(diagnostics).not.toContainText('Private unsaved description');
  } finally { await context.close(); }
});

test('detailed layout recording survives popup closure and downloads the real drag timeline', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const html = nativeTicketHtml().replace('</style>', `
      .work-item-form-page { display:flex;flex-direction:column;align-items:flex-start; }
      .work-item-grid { width:100%; }
      </style>`);
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, html);
    const popupUrl = popup.url();
    await popup.getByRole('button', { name: 'Inspection details', exact: true }).click();
    await popup.getByRole('button', { name: 'Record layout (15s)', exact: true }).click();
    await expect(popup.getByRole('status')).toContainText('Recording for 15 seconds');
    await popup.close();
    await page.bringToFront();
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const reopened = await context.newPage();
    await page.bringToFront();
    await reopened.goto(popupUrl);
    await reopened.getByRole('button', { name: 'Inspection details', exact: true }).click();
    const pending = reopened.waitForEvent('download');
    await reopened.getByRole('button', { name: 'Download layout report', exact: true }).click();
    const download = await pending;
    const file = info.outputPath('layout-report.json');
    await download.saveAs(file);
    const encoded = await readFile(file, 'utf8');
    const report: unknown = JSON.parse(encoded);
    expect(report).toMatchObject({ extension: 'ADOverride', kind: 'ado-layout-capture', version: 1,
      events: expect.arrayContaining([expect.objectContaining({ type: 'drag-start' }),
        expect.objectContaining({ type: 'drag-end' }), expect.objectContaining({ type: 'save-ack' })]),
      snapshots: expect.arrayContaining([expect.objectContaining({ stage: 'start' }),
        expect.objectContaining({ stage: 'native' }), expect.objectContaining({ stage: 'applied' })]),
      recordedCounters: expect.objectContaining({ reconciliations: expect.any(Number) }) });
    expect(encoded).toContain('"offsetParent"');
    expect(encoded).toContain('"min-width"');
    expect(encoded).toContain('"rooster-editor"');
    expect(encoded).toContain('"shell-header"');
    expect(encoded).toContain('"navigation"');
    expect(report).toMatchObject({ snapshots: expect.arrayContaining([expect.objectContaining({
      coverage: { shellTruncated: false, bodyTruncated: false, discoveredCards: 5, capturedCards: 5 },
    })]) });
    for (const value of ['Private draft title', 'Private unsaved description', 'Unsaved review', 'Unsaved development', '_workitems/edit/101']) {
      expect(encoded).not.toContain(value);
    }
  } finally { await context.close(); }
});

test('metadata failures remain explicit and never hide unmapped fields', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false, true);
    await expect(popup.getByText('Form metadata returned HTTP 403.', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Description draft' })).toBeVisible();
    await expect(page.locator('[data-ado-ticket-hidden]')).toHaveCount(0);
    await find(popup, 'Planning');
    await expect(popup.getByRole('button', { name: 'Show Planning', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('global preferences persist across browser restart and host aliases', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile);
  try {
    const { popup, page } = await fixture(context, 'https://dev.azure.com', false);
    await find(popup, 'Planning');
    await popup.getByRole('button', { name: 'Show Planning', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    await context.close();
    context = await launch(profile);
    const reopened = await fixture(context, 'https://example.visualstudio.com', false);
    await expect(reopened.page.locator('#sample\\.planning')).not.toBeVisible();
    await expect(reopened.popup.getByRole('searchbox', { name: 'Find a Ticket card or field' })).toBeVisible();
  } finally { await context.close(); }
});

test('Ticket priorities: visibility reports pending and durable saves, with native Undo after popup closure', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false);
    const planning = page.locator('#sample\\.planning');
    const identity = await planning.evaluateHandle(card => ({ card, parent: card.parentElement }));
    const draft = page.getByRole('textbox', { name: 'Description draft' });
    await draft.fill('Keep the draft while saving and undoing.');
    await find(popup, 'Planning');
    const release = await pausePreferenceWrites(context);
    try {
      await popup.getByRole('button', { name: 'Show Planning', exact: true }).click();
      await expect(popup.getByRole('status')).toContainText('Saving...');
      await expect(planning).toBeVisible();
      expect((await savedSettings(context)).ticket.undo).toBeNull();
      await expect(popup.getByRole('button', { name: 'Undo last Ticket change', exact: true })).toBeDisabled();
    } finally { await release.evaluate(unblock => unblock()); }
    await expect(popup.getByRole('status')).toContainText('Visibility saved');
    await expect(planning).not.toBeVisible();
    await popup.close();
    await page.getByRole('button', { name: 'Undo saved Ticket change', exact: true }).click();
    await expect(planning).toBeVisible();
    await expect(page.locator('ado-ticket-save-feedback').getByRole('status')).toContainText('Change undone');
    expect((await savedSettings(context)).ticket.undo).toBeNull();
    expect(await identity.evaluate(state => state.card.isConnected && state.card.parentElement === state.parent)).toBe(true);
    await expect(draft).toHaveValue('Keep the draft while saving and undoing.');
  } finally { await context.close(); }
});

test('Ticket priorities: native move feedback and Undo retain original card and editor nodes', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeActionsTicketHtml(true));
    const description = page.getByRole('textbox', { name: 'Description draft' });
    await description.fill('Keep the native rich-text draft.');
    const identity = await description.evaluateHandle(editor => ({ editor, parent: editor.parentElement }));
    const planning = page.locator('#sample\\.planning');
    const original = await planning.evaluate(card => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y }));
    await popup.close();
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const feedback = page.locator('ado-ticket-save-feedback');
    await expect(feedback).toContainText('Layout saved');
    await feedback.screenshot({ path: info.outputPath('native-save-undo.png') });
    await feedback.getByRole('button', { name: 'Undo saved Ticket change', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await expect.poll(() => planning.evaluate(card => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y }))).toEqual(original);
    await expect(description).toHaveText('Keep the native rich-text draft.');
    expect(await identity.evaluate(state => state.editor.isConnected && state.editor.parentElement === state.parent)).toBe(true);
    expect((await savedSettings(context)).ticket.undo).toBeNull();
  } finally { await context.close(); }
});

test('Ticket priorities: persistent lock keeps hiding and saved positions active, including presets and Undo', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeActionsTicketHtml(true));
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences',
      action: { kind: 'save-preset', area: 'ticket', id: 'native-baseline', name: 'Native baseline' } }));
    const draft = page.getByRole('textbox', { name: 'Description draft' });
    await draft.fill('Lock must preserve this native draft.');
    const identity = await draft.evaluateHandle(editor => ({ editor, parent: editor.parentElement }));
    await dragToDevelopment(page);
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Arranged');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    const before = await savedSettings(context);
    await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await expect(draft).toHaveText('Lock must preserve this native draft.');
    expect(await identity.evaluate(state => state.editor.isConnected && state.editor.parentElement === state.parent)).toBe(true);
    const locked = await savedSettings(context);
    expect(locked.ticket.layoutLocked).toBe(true);
    expect(locked.ticket.cardLayouts).toEqual(before.ticket.cardLayouts);
    expect(locked.ticket.savedPresets[0]?.ticket).not.toHaveProperty('layoutLocked');
    await popup.locator('.popup').screenshot({ path: info.outputPath('locked-ticket-popup.png') });
    expect(await popup.locator('.popup').evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      overflow: node.scrollWidth - node.clientWidth }))).toEqual({ width: 340, height: 480, overflow: 0 });
    await popup.getByRole('button', { name: /Choose preset, current/ }).click();
    await popup.getByRole('menuitemradio', { name: 'Native baseline', exact: true }).click();
    await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
    await expect(page.locator('#sample\\.review')).toBeVisible();
    await popup.getByRole('button', { name: 'Undo last Ticket change', exact: true }).click();
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    expect((await savedSettings(context)).ticket.layoutLocked).toBe(true);
    await page.reload();
    await popup.reload();
    await expect(popup.getByRole('button', { name: 'Unlock layout', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await popup.getByRole('button', { name: 'Unlock layout', exact: true }).click();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(4);
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual(before.ticket.cardLayouts);
  } finally { await context.close(); }
});

test('Ticket priorities: locking cancels active feedback and the writer rejects stale card moves', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const hand = page.getByRole('button', { name: 'Move Planning', exact: true });
    await hand.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"]')).toBeVisible();
    await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await expect(page.locator('[data-ado-ticket-drag-source], [data-ado-ticket-drop]')).toHaveCount(0);
    await expect(page.locator('[data-ado-ticket-ui="drag-preview"], [data-ado-ticket-ui="drop-preview"]')).toHaveCount(0);
    const rejected = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences', action: {
      kind: 'ticket-card-move', page: 'page:details', key: 'group:details/planning', column: 2, before: null,
      native: [['group:details/description'], ['group:details/planning', 'group:details/review'], ['group:details/development']],
    } }));
    expect(rejected).toMatchObject({ ok: false, error: expect.stringContaining('locked') });
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual({});
    await popup.getByRole('button', { name: 'Inspection details', exact: true }).click();
    await expect(popup.getByLabel('Inspection diagnostics', { exact: true })).toContainText('"status": "locked"');
    await expect(popup.getByLabel('Inspection diagnostics', { exact: true })).toContainText('"mountedHandles": 0');
  } finally { await context.close(); }
});

test('Ticket priorities: one-step Undo survives restart and stale Undo cannot overwrite a newer change', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile);
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const move = await savedSettings(context);
    const oldId = move.ticket.undo?.id;
    if (!oldId) throw new Error('Missing acknowledged move Undo.');
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    const hidden = await savedSettings(context);
    expect(hidden.ticket.undo?.id).not.toBe(oldId);
    const rejected = await popup.evaluate(id => chrome.runtime.sendMessage({
      type: 'ado-customize/preferences', action: { kind: 'undo-ticket', id },
    }), oldId);
    expect(rejected).toMatchObject({ ok: false, error: expect.stringContaining('newer customization') });
    expect((await savedSettings(context)).ticket).toEqual(hidden.ticket);
    await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await context.close();
    context = await launch(profile);
    const reopened = await fixture(context, 'https://example.visualstudio.com', true, false, false, ticketHtml(true, true));
    await expect(reopened.page.locator('#sample\\.review')).not.toBeVisible();
    await expect(reopened.popup.getByRole('button', { name: 'Unlock layout', exact: true })).toBeVisible();
    await expect(reopened.page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await expect(reopened.popup.getByRole('button', { name: 'Undo last Ticket change', exact: true })).toBeEnabled();
    await reopened.popup.getByRole('button', { name: 'Undo last Ticket change', exact: true }).click();
    await expect(reopened.page.locator('#sample\\.review')).toBeVisible();
    await expect(reopened.page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(reopened.popup.getByRole('button', { name: 'Undo last Ticket change', exact: true })).toBeDisabled();
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual(move.ticket.cardLayouts);
    expect((await savedSettings(context)).ticket.layoutLocked).toBe(true);
  } finally { await context.close(); }
});

test('Ticket priorities: failed visibility saves report failure without replacing the last valid Undo', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await dragToDevelopment(page);
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    const before = await savedSettings(context);
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    await worker.evaluate(async () => {
      const used = await chrome.storage.local.getBytesInUse(null);
      const key = 'priorities-quota';
      await chrome.storage.local.set({ [key]: 'x'.repeat(10 * 1024 * 1024 - used - key.length - 40) });
    });
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(popup.getByRole('alert')).toContainText(/quota|QUOTA/i);
    await expect(popup.getByRole('status')).toHaveCount(0);
    await expect(page.locator('#sample\\.review')).toBeVisible();
    expect((await savedSettings(context)).ticket).toEqual(before.ticket);
    await worker.evaluate(() => chrome.storage.local.remove('priorities-quota'));
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(popup.getByRole('status')).toContainText('Visibility saved');
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    expect((await savedSettings(context)).ticket.undo?.id).not.toBe(before.ticket.undo?.id);
  } finally { await context.close(); }
});

test('Ticket priorities: installed v4 migration preserves active positions and rules while retiring named presets', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await dragToDevelopment(page);
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Existing view');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Existing view', exact: true })).toBeVisible();
    const current = await savedSettings(context);
    const { revision: _revision, ticket: settings, ...legacy } = current;
    const { layoutLocked: _lock, undo: _undo, ...ticket } = settings;
    const v4 = { ...legacy, version: 4, ticket };
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    await worker.evaluate(async old => {
      await chrome.storage.local.set({ 'ado-customize.preferences.v4': old });
      await chrome.storage.local.remove('ado-customize.preferences.v11');
    }, v4);
    const initialized = await popup.evaluate(() => chrome.runtime.sendMessage({
      type: 'ado-customize/preferences', action: { kind: 'initialize' },
    }));
    expect(initialized).toMatchObject({ ok: true });
    await page.reload();
    await popup.reload();
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Custom view', exact: true })).toBeVisible();
    const migrated = await savedSettings(context);
    expect(migrated.ticket).toEqual({ ...ticket, presetId: 'ticket:kiwifruit', savedPresets: [], layoutLocked: false, undo: null });
    expect(migrated.savedPresets).toEqual([]);
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('ado-customize.preferences.v4'))['ado-customize.preferences.v4'])).toEqual(v4);
  } finally { await context.close(); }
});

test('Ticket priorities: native saving feedback waits for the writer and scroll-independent popup feedback stays readable', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml(true));
    const release = await pausePreferenceWrites(context);
    try {
      await dragToDevelopment(page);
      await expect(page.locator('ado-ticket-save-feedback').getByRole('status')).toContainText('Saving...');
      await expect(page.locator('[data-ado-ticket-manual]')).toHaveCount(0);
      expect((await savedSettings(context)).ticket.undo).toBeNull();
    } finally { await release.evaluate(unblock => unblock()); }
    await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
    await expect(popup.getByRole('status')).toContainText('Layout saved');
    await popup.getByRole('button', { name: 'Switch popup to dark theme', exact: true }).click();
    await expect(popup.getByRole('status')).toContainText('Settings saved');
    await popup.locator('.popup-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
    const bounds = await popup.getByRole('status').evaluate(status => {
      const popup = status.closest('.popup');
      if (!popup) throw new Error('Missing popup.');
      const box = status.getBoundingClientRect();
      const frame = popup.getBoundingClientRect();
      return { top: box.top - frame.top, bottom: frame.bottom - box.bottom, overflow: popup.scrollWidth - popup.clientWidth };
    });
    expect(bounds.top).toBeGreaterThan(0);
    expect(bounds.bottom).toBeGreaterThanOrEqual(36);
    expect(bounds.overflow).toBe(0);
    await popup.locator('.popup').screenshot({ path: info.outputPath('dark-saved-popup.png') });
  } finally { await context.close(); }
});

test('Ticket priorities: a late popup acknowledgment cannot remove a newer lock', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const release = await popup.evaluateHandle(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      let resolve!: () => void;
      const barrier = new Promise<void>(done => { resolve = done; });
      chrome.runtime.sendMessage = async message => {
        const result = await original(message);
        if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'ado-customize/preferences' &&
          'action' in message && typeof message.action === 'object' && message.action !== null &&
          'kind' in message.action && message.action.kind === 'ticket-target') await barrier;
        return result;
      };
      return () => { chrome.runtime.sendMessage = original; resolve(); };
    });
    try {
      await find(popup, 'Review');
      await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
      await expect(page.locator('#sample\\.review')).not.toBeVisible();
      await expect(popup.getByRole('status')).toContainText('Saving...');
      const locked = await popup.evaluate(() => chrome.runtime.sendMessage({
        type: 'ado-customize/preferences', action: { kind: 'ticket-layout-lock', locked: true },
      }));
      expect(locked).toMatchObject({ ok: true });
      await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    } finally { await release.evaluate(unblock => unblock()); }
    await expect(popup.getByRole('status')).toContainText('Visibility saved');
    await expect(popup.getByRole('button', { name: 'Unlock layout', exact: true })).toBeEnabled();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    expect((await savedSettings(context)).ticket.layoutLocked).toBe(true);
  } finally { await context.close(); }
});

test('Inline visibility: aligned native controls hide and restore a card without opening the popup', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeActionsTicketHtml(true));
    const card = page.locator('#sample\\.planning');
    const draft = page.getByRole('textbox', { name: 'Description draft' });
    await draft.fill('Keep the inline draft.');
    const identity = await card.evaluateHandle(node => ({ node, parent: node.parentElement }));
    await popup.close();
    await card.hover();
    const hide = card.getByRole('button', { name: 'Hide Planning', exact: true });
    await expect(hide).toBeEnabled();
    await expect(card.locator('.work-item-form-section-controls > ado-ticket-visibility-control')).toHaveCount(1);
    const geometry = await hide.evaluate(button => {
      const root = button.getRootNode();
      if (!(root instanceof ShadowRoot)) throw new Error('Missing card controls.');
      const controls = root.host.parentElement;
      const hand = controls?.querySelector('ado-ticket-drag-handle')?.getBoundingClientRect();
      if (!hand) throw new Error('Missing hand.');
      const eye = button.getBoundingClientRect();
      const header = controls?.closest('.work-item-form-collapsible-header');
      if (!header) throw new Error('Missing native header.');
      const card = header.closest('.work-item-form-group');
      if (!card?.parentElement) throw new Error('Missing native column.');
      return { gap: eye.left - hand.right, center: eye.top + eye.height / 2 - hand.top - hand.height / 2,
        overflow: eye.right - card.parentElement.getBoundingClientRect().right };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.gap).toBeGreaterThanOrEqual(3);
    expect(geometry.gap).toBeLessThanOrEqual(8);
    expect(Math.abs(geometry.center)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('inline-header-actions.png') });
    await hide.click();
    await expect(card).not.toBeVisible();
    await page.getByRole('button', { name: 'Hidden (1)', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Show Planning', exact: true }).click();
    await expect(card).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hidden (1)', exact: true })).toHaveCount(0);
    await expect(draft).toHaveText('Keep the inline draft.');
    expect(await identity.evaluate(state => state.node.isConnected && state.node.parentElement === state.parent)).toBe(true);
    await page.getByRole('button', { name: 'Undo saved Ticket change', exact: true }).click();
    await expect(card).not.toBeVisible();
  } finally { await context.close(); }
});

test('Inline visibility: locked layouts hide the restoration menu and unlocking preserves child-field preferences', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await dragToDevelopment(page);
    await find(popup, 'Priority');
    await popup.getByRole('button', { name: 'Show Priority', exact: true }).click();
    await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
    const positions = (await savedSettings(context)).ticket.cardLayouts;
    const popupUrl = popup.url();
    await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(0);
    await expect(page.locator('[data-ado-ticket-ui="card-actions"]')).toHaveCount(0);
    for (const name of ['Planning', 'Review']) {
      await find(popup, name);
      await popup.getByRole('button', { name: `Show ${name}`, exact: true }).click();
    }
    await popup.close();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hidden (2)', exact: true })).toHaveCount(0);
    await expect(page.locator('ado-ticket-hidden-menu')).toHaveCount(0);
    const reopened = await context.newPage();
    await page.bringToFront();
    await reopened.goto(popupUrl);
    await reopened.getByRole('button', { name: 'Unlock layout', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hide Description', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Hidden (2)', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Show all hidden cards', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).toBeVisible();
    await expect(page.locator('#sample\\.review')).toBeVisible();
    await expect(page.locator('[data-field-name="Microsoft.VSTS.Common.Priority"]')).not.toBeVisible();
    expect((await savedSettings(context)).ticket.cardLayouts).toEqual(positions);
    expect((await savedSettings(context)).ticket.layoutLocked).toBe(false);
    await page.getByRole('button', { name: 'Undo saved Ticket change', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hidden (2)', exact: true })).toBeVisible();
    const hiddenBeforeLock = (await savedSettings(context)).ticket.hiddenTargets;
    await page.getByRole('button', { name: 'Hidden (2)', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Show all hidden cards', exact: true })).toBeVisible();
    await reopened.getByRole('button', { name: 'Lock layout', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hidden (2)', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Show all hidden cards', exact: true })).toHaveCount(0);
    expect((await savedSettings(context)).ticket.hiddenTargets).toEqual(hiddenBeforeLock);
    await reopened.getByRole('button', { name: 'Unlock layout', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hidden (2)', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Show all hidden cards', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test('Inline visibility: unmapped regions prevent dragging but not safe card hiding, and pause removes controls', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const html = ticketHtml(false, true).replace('<div class="work-item-grid">', '<div class="work-item-grid"><aside>Unknown region</aside>');
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, html);
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    await page.locator('#sample\\.planning').hover();
    await page.getByRole('button', { name: 'Hide Planning', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    await expect(page.getByText('Unknown region', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hidden (1)', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Show Planning', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).toBeVisible();
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(0);
    await expect(page.locator('[data-ado-ticket-ui="card-actions"]')).toHaveCount(0);
    await expect(page.locator('[data-ado-ticket-root]')).toHaveCount(0);
  } finally { await context.close(); }
});

test('Configuration transfer: download round-trips both banks without ticket content or Undo history', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    await dragToDevelopment(page);
    await find(popup, 'Review');
    await popup.getByRole('button', { name: 'Show Review', exact: true }).click();
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Ticket export');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Ticket export', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Library', exact: true }).click();
    await popup.getByRole('button', { name: 'Equal-width columns', exact: true }).click();
    await popup.getByRole('button', { name: 'Save as preset', exact: true }).click();
    await popup.getByRole('textbox', { name: /Preset name/ }).fill('Library export');
    await popup.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Choose preset, current Library export', exact: true })).toBeVisible();
    const before = await savedSettings(context);
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    const pending = popup.waitForEvent('download');
    await popup.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/^adoverride-config-.+\.json$/);
    const file = info.outputPath('configuration.json');
    await download.saveAs(file);
    const encoded = await readFile(file, 'utf8');
    const imported = parseConfiguration(encoded);
    expect(imported.preferences).toEqual(portablePreferences(before));
    for (const value of ['Private draft title', 'Private unsaved description', 'Unsaved development', '_workitems/edit/101', before.ticket.undo?.id]) {
      if (value) expect(encoded).not.toContain(value);
    }
    expect((await savedSettings(context))).toEqual(before);
  } finally { await context.close(); }
});

test('Configuration transfer: validated replacement creates a durable backup and restores all settings without touching drafts', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, nativeTicketHtml());
    const draft = page.getByRole('textbox', { name: 'Description draft' });
    await draft.fill('Configuration must not overwrite this draft.');
    const identity = await draft.evaluateHandle(node => ({ node, parent: node.parentElement }));
    const original = await savedSettings(context);
    const incoming = defaultPreferences();
    incoming.theme = 'dark';
    incoming.ticket.layoutLocked = true;
    incoming.ticket.hiddenTargets = ['group:details/review'];
    incoming.savedPresets = [{ id: 'imported', name: 'Imported', appearance: defaultView().appearance, board: defaultView().board }];
    incoming.ticket.savedPresets = [{ id: 'imported', name: 'Imported', ticket: {
      hiddenTargets: ['group:details/review'], cardLayouts: {}, viewMode: 'native', workspaceLayouts: {},
    } }];
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    await popup.locator('input[type="file"]').setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportConfiguration(incoming))) });
    await expect(popup.getByRole('table', { name: 'Configuration preview', exact: true })).toBeVisible();
    expect((await savedSettings(context))).toEqual(original);
    await popup.getByRole('button', { name: 'Replace configuration', exact: true }).click();
    await expect(popup.locator('.save-feedback')).toContainText('Configuration imported');
    await expect(page.locator('#sample\\.review')).not.toBeVisible();
    await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
    expect(portablePreferences(await savedSettings(context))).toEqual(portablePreferences(incoming));
    await expect(draft).toHaveText('Configuration must not overwrite this draft.');
    expect(await identity.evaluate(state => state.node.isConnected && state.node.parentElement === state.parent)).toBe(true);
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    const backup = decodeConfigurationBackup(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], CONFIGURATION_BACKUP_KEY));
    expect(backup.configuration.preferences).toEqual(portablePreferences(original));
    await popup.locator('.popup').screenshot({ path: info.outputPath('configuration-backup-dark.png') });
    await popup.reload();
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    await popup.getByRole('button', { name: 'Restore pre-import backup...', exact: true }).click();
    await expect(popup.getByRole('table', { name: 'Configuration preview', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Restore configuration', exact: true }).click();
    await expect(popup.locator('.save-feedback')).toContainText('Backup restored');
    expect(portablePreferences(await savedSettings(context))).toEqual(portablePreferences(original));
    await expect(page.locator('#sample\\.review')).toBeVisible();
    await expect(draft).toHaveText('Configuration must not overwrite this draft.');
  } finally { await context.close(); }
});

test('Configuration transfer: corrupt, cancelled and stale previews never overwrite settings', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://dev.azure.com', false);
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    const original = await savedSettings(context);
    const file = popup.locator('input[type="file"]');
    await file.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"ado-layout-capture","version":1}') });
    await expect(popup.getByRole('alert')).toContainText('not a supported');
    expect(await savedSettings(context)).toEqual(original);
    const incoming = { ...defaultPreferences(), theme: 'dark' as const };
    const buffer = Buffer.from(JSON.stringify(exportConfiguration(incoming)));
    await file.setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer });
    await popup.getByRole('button', { name: 'Cancel import', exact: true }).click();
    expect(await savedSettings(context)).toEqual(original);
    await file.setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer });
    await expect(popup.getByRole('button', { name: 'Replace configuration', exact: true })).toBeEnabled();
    await page.locator('#sample\\.planning').hover();
    await page.getByRole('button', { name: 'Hide Planning', exact: true }).click();
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    await expect(popup.getByRole('button', { name: 'Replace configuration', exact: true })).toBeDisabled();
    await expect(popup.getByRole('alert')).toContainText('changed since this preview');
    const rejected = await popup.evaluate(({ preferences, revision }) => chrome.runtime.sendMessage({ type: 'ado-customize/preferences',
      action: { kind: 'replace-configuration', preferences, expectedRevision: revision } }), { preferences: incoming, revision: original.revision });
    expect(rejected).toMatchObject({ ok: false, error: expect.stringContaining('preview') });
    await popup.getByRole('button', { name: 'Review again', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Replace configuration', exact: true })).toBeEnabled();
    await popup.locator('.popup').screenshot({ path: info.outputPath('configuration-preview.png') });
    expect(await popup.locator('.popup').evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      overflow: node.scrollWidth - node.clientWidth }))).toEqual({ width: 340, height: 480, overflow: 0 });
    await popup.getByRole('button', { name: 'Cancel import', exact: true }).click();
    expect((await savedSettings(context)).ticket.hiddenTargets).toContain('group:details/planning');
  } finally { await context.close(); }
});

test('Configuration transfer: a quota failure keeps preferences and backup unchanged and permits retry', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { popup } = await fixture(context, 'https://dev.azure.com', false);
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    const before = await savedSettings(context);
    const incoming = defaultPreferences();
    incoming.theme = 'dark';
    const file = { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportConfiguration(incoming))) };
    await popup.locator('input[type="file"]').setInputFiles(file);
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    await worker.evaluate(async () => {
      const used = await chrome.storage.local.getBytesInUse(null);
      const key = 'configuration-quota';
      await chrome.storage.local.set({ [key]: 'x'.repeat(10 * 1024 * 1024 - used - key.length - 40) });
    });
    await popup.getByRole('button', { name: 'Replace configuration', exact: true }).click();
    await expect(popup.locator('.save-feedback')).toContainText(/quota|QUOTA/i);
    expect(await savedSettings(context)).toEqual(before);
    expect(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], CONFIGURATION_BACKUP_KEY)).toBeUndefined();
    await worker.evaluate(() => chrome.storage.local.remove('configuration-quota'));
    await popup.getByRole('button', { name: 'Replace configuration', exact: true }).click();
    await expect(popup.locator('.save-feedback')).toContainText('Configuration imported');
    expect((await savedSettings(context)).theme).toBe('dark');
    expect(decodeConfigurationBackup(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], CONFIGURATION_BACKUP_KEY))
      .configuration.preferences).toEqual(portablePreferences(before));
  } finally { await context.close(); }
});

test('Inline visibility: all hidden cards remain reachable through the keyboard menu in a dialog', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page, popup } = await fixture(context, 'https://example.visualstudio.com', true, false, false, ticketHtml(true, true));
    await popup.close();
    for (const name of ['Planning', 'Review', 'Development', 'Discussion', 'Description']) {
      const button = page.getByRole('button', { name: `Hide ${name}`, exact: true });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveCount(0);
    }
    const hidden = page.getByRole('button', { name: 'Hidden (5)', exact: true });
    await hidden.focus();
    await page.keyboard.press('Enter');
    const restore = page.getByRole('menuitem', { name: 'Show all hidden cards', exact: true });
    await expect(page.getByRole('menuitem', { name: 'Show Description', exact: true })).toBeFocused();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.keyboard.press('End');
    await expect(restore).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(5);
    await expect(hidden).toHaveCount(0);
    await page.locator('.work-item-form-dialog').evaluate(dialog => dialog.remove());
    await expect(page.locator('ado-ticket-visibility-control')).toHaveCount(0);
    await expect(page.locator('ado-ticket-hidden-menu')).not.toBeVisible();
  } finally { await context.close(); }
});

test('Inline visibility: failed saves retain the visible card and valid history until retry', async ({}, info) => {
  const context = await launch(info.outputPath('profile'));
  try {
    const { page } = await fixture(context, 'https://dev.azure.com', false, false, false, ticketHtml(false, true));
    const before = await savedSettings(context);
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error('No extension worker.');
    await worker.evaluate(async () => {
      const used = await chrome.storage.local.getBytesInUse(null);
      const key = 'visibility-quota';
      await chrome.storage.local.set({ [key]: 'x'.repeat(10 * 1024 * 1024 - used - key.length - 40) });
    });
    const hide = page.getByRole('button', { name: 'Hide Planning', exact: true });
    await hide.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText(/quota|QUOTA/i);
    expect(await savedSettings(context)).toEqual(before);
    await expect(page.locator('#sample\\.planning')).toBeVisible();
    await worker.evaluate(() => chrome.storage.local.remove('visibility-quota'));
    await hide.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#sample\\.planning')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Hidden (1)', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('Configuration transfer: queued import survives popup closure and backup restoration survives browser restart', async ({}, info) => {
  const profile = info.outputPath('profile');
  let context = await launch(profile);
  try {
    const { popup } = await fixture(context, 'https://dev.azure.com', false);
    const original = await savedSettings(context);
    const incoming = defaultPreferences();
    incoming.theme = 'dark';
    incoming.enabled = false;
    await popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    await popup.locator('input[type="file"]').setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportConfiguration(incoming))) });
    const release = await pausePreferenceWrites(context);
    try {
      await popup.getByRole('button', { name: 'Replace configuration', exact: true }).click();
      await expect(popup.locator('.save-feedback')).toContainText('Saving...');
      await popup.close();
    } finally { await release.evaluate(unblock => unblock()); }
    await expect.poll(async () => (await savedSettings(context)).enabled).toBe(false);
    await context.close();
    context = await launch(profile);
    const reopened = await fixture(context, 'https://example.visualstudio.com', false);
    await expect(reopened.popup.getByRole('button', { name: 'Enable ADOverride', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await reopened.popup.getByRole('button', { name: 'Configuration', exact: true }).click();
    await reopened.popup.getByRole('button', { name: 'Restore pre-import backup...', exact: true }).click();
    await reopened.popup.getByRole('button', { name: 'Restore configuration', exact: true }).click();
    await expect(reopened.popup.locator('.save-feedback')).toContainText('Backup restored');
    expect(portablePreferences(await savedSettings(context))).toEqual(portablePreferences(original));
  } finally { await context.close(); }
});

for (const scenario of [
  { scrolling: 'page', packed: false, locked: false },
  { scrolling: 'editor', packed: false, locked: false },
  { scrolling: 'dialog', packed: false, locked: false },
  { scrolling: 'page', packed: true, locked: false },
  { scrolling: 'editor', packed: true, locked: true },
] as const) {
  const { scrolling, packed, locked } = scenario;
  test(`Scroll stability: bottom hover preserves ${scrolling} position${packed ? ' with stacked cards' : ''}${locked ? ' and locked hiding' : ''}`, async ({}, info) => {
    const context = await launch(info.outputPath('profile'));
    try {
      const html = nativeActionsTicketHtml().replace('</style>', `
        #sample\\.review, #sample\\.development { min-height:300px; }
        ${scrolling === 'editor' ? '.work-item-form-page { height:700px; overflow-y:auto; box-sizing:border-box; }' : ''}
        </style>`);
      const { page, popup } = await fixture(context, 'https://dev.azure.com', false, false, false, html);
      if (scrolling === 'dialog') await page.locator('.work-item-form-page').evaluate(form => {
        const wrapper = document.createElement('div');
        wrapper.className = 'work-item-form-dialog';
        Object.assign(wrapper.style, { height: '700px', width: '1100px', overflow: 'auto' });
        form.before(wrapper); wrapper.append(form);
      });
      await page.setViewportSize({ width: 1280, height: 760 });
      await expect(page.getByRole('button', { name: 'Move Planning', exact: true })).toBeEnabled();
      const native = [
        ['group:details/description', 'group:details/discussion'],
        ['group:details/planning', 'group:details/review'],
        ['group:details/development'],
      ];
      for (const key of packed ? ['group:details/planning', 'group:details/review', 'group:details/development'] : ['group:details/development']) {
        const reply = await popup.evaluate(({ key, native, packed }) => chrome.runtime.sendMessage({
          type: 'ado-customize/preferences', action: { kind: 'ticket-card-move', page: 'page:details', key, column: packed ? 0 : 1, before: null, native },
        }), { key, native, packed });
        expect(reply).toMatchObject({ ok: true });
      }
      if (locked) {
        const reply = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ado-customize/preferences', action: {
          kind: 'ticket-target', key: 'group:details/discussion', hidden: true,
        } }));
        expect(reply).toMatchObject({ ok: true });
        await popup.getByRole('button', { name: 'Lock layout', exact: true }).click();
        await expect(page.locator('ado-ticket-drag-handle')).toHaveCount(0);
        await expect(page.locator('.work-item-form-discussion')).not.toBeVisible();
        await expect(page.getByRole('button', { name: 'Hidden (1)', exact: true })).toHaveCount(0);
      }
      await expect(page.locator('.work-item-grid')).toHaveAttribute('data-ado-ticket-manual', '');
      await popup.close();
      const viewport = page.locator('.work-item-form-page');
      const read = () => page.evaluate(scrolling => {
        const scroller = scrolling === 'page' ? document.scrollingElement : document.querySelector(scrolling === 'dialog' ? '.work-item-form-dialog' : '.work-item-form-page');
        if (!(scroller instanceof HTMLElement)) throw new Error('Missing native scroller.');
        return { top: scroller.scrollTop, maximum: scroller.scrollHeight - scroller.clientHeight };
      }, scrolling);
      await page.evaluate(scrolling => {
        const scroller = scrolling === 'page' ? document.scrollingElement : document.querySelector(scrolling === 'dialog' ? '.work-item-form-dialog' : '.work-item-form-page');
        if (!(scroller instanceof HTMLElement)) throw new Error('Missing native scroller.');
        for (const header of document.querySelectorAll('.work-item-form-collapsible-header')) {
          header.addEventListener('mouseenter', () => header.classList.add('native-hover'));
          header.addEventListener('mouseleave', () => header.classList.remove('native-hover'));
        }
        scroller.scrollTop = scroller.scrollHeight;
      }, scrolling);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const bottom = await read();
      expect(bottom.maximum).toBeGreaterThan(50);
      expect(bottom.top).toBeGreaterThanOrEqual(bottom.maximum - 1);
      const header = await page.locator('#sample\\.development .work-item-form-collapsible-header').boundingBox();
      if (!header) throw new Error('Missing bottom card header.');
      expect(header.y).toBeGreaterThanOrEqual(0);
      expect(header.y).toBeLessThan(700);
      const before = await savedSettings(context);
      const identity = await viewport.evaluateHandle(element => ({ element, parent: element.parentElement }));
      for (let move = 0; move < 8; move++) {
        await page.mouse.move(move % 2 ? 4 : header.x + 8, move % 2 ? 4 : header.y + header.height / 2);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect((await read()).top, 'Hover must not reset scrolling while reconciling the native form').toBeGreaterThanOrEqual(bottom.top - 1);
      }
      expect(await savedSettings(context)).toEqual(before);
      expect(await identity.evaluate(state => state.element.isConnected && state.element.parentElement === state.parent)).toBe(true);
      const userPosition = Math.round(bottom.top * 0.6);
      await page.evaluate(({ scrolling, top }) => {
        const scroller = scrolling === 'page' ? document.scrollingElement : document.querySelector(scrolling === 'dialog' ? '.work-item-form-dialog' : '.work-item-form-page');
        if (!(scroller instanceof HTMLElement)) throw new Error('Missing native scroller.');
        scroller.scrollTop = top;
        const native = document.querySelector('.work-item-form-collapsible-header');
        native?.classList.add('native-after-user-scroll');
      }, { scrolling, top: userPosition });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect((await read()).top).toBeCloseTo(userPosition, 0);
      await expect(viewport).toBeVisible();
    } finally { await context.close(); }
  });
}
