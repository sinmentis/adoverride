import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { decodePreferences, defaultPreferences } from '../../lib/preferences';
import { prFilesHtml, prOverviewHtml } from './pr-fixture';

type ExtensionApi = (typeof import('wxt/browser'))['browser'];
declare const chrome: ExtensionApi;
const ADDRESS = 'https://dev.azure.com/example/Platform/_git/service/pullrequest/42';
const KEY = `ado-customize.preferences.v${defaultPreferences().version}`;

async function launch(profile: string) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${path.resolve('.output/chrome-mv3')}`, `--load-extension=${path.resolve('.output/chrome-mv3')}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await expect.poll(() => worker.evaluate(() => chrome.storage.local.get(null))).not.toEqual({});
  return { context, worker };
}
async function open(context: BrowserContext, html: { overview?: string; files?: string } = {}, query = '', height = 1000) {
  await context.route('https://dev.azure.com/**', route => {
    const url = new URL(route.request().url());
    expect(url.pathname).not.toContain('/_apis/');
    const tab = url.searchParams.get('_a');
    const body = tab === 'files' ? html.files ?? prFilesHtml() : tab && tab !== 'overview' ? prOverviewHtml({ selected: tab }) : html.overview ?? prOverviewHtml();
    return route.fulfill({ contentType: 'text/html', body });
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.setViewportSize({ width: 1440, height });
  await page.goto(`${ADDRESS}${query}`);
  return page;
}
async function popupFor(context: BrowserContext, page: Page) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Missing extension worker.');
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  return popup;
}
async function stored(context: BrowserContext) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Missing extension worker.');
  return decodePreferences(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], KEY));
}
async function setPr(context: BrowserContext, patch: Record<string, unknown>) {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Missing extension worker.');
  const current = await stored(context);
  await worker.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), { key: KEY,
    value: { ...current, revision: current.revision + 1, pr: { ...current.pr, ...patch } } });
}
const hidden = (page: Page, selector: string) => page.locator(selector).evaluate(node => getComputedStyle(node).display === 'none');
function box(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(node => node.getBoundingClientRect().toJSON() as DOMRect);
}
async function tagNatives(page: Page) {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-fixture],[data-fixture-reviewer],.repos-activity-filter-dropdown>button,tr.bolt-timeline-row,[role="tab"]:not([data-ado-pr-tab]),.repos-pr-description')];
    (window as unknown as { __natives: [Element, Element | null][] }).__natives = nodes.map(node => [node, node.parentElement]);
  });
}
async function nativesIntact(page: Page) {
  const broken = await page.evaluate(() => (window as unknown as { __natives: [Element, Element | null][] }).__natives
    .filter(([node, parent]) => !node.isConnected || node.parentElement !== parent).map(([node]) => node.outerHTML.slice(0, 120)));
  if (broken.length) console.log('moved natives', broken);
  return broken.length === 0;
}

test('PR overview: kiwifruit defaults fold noise, move merge status to the sidebar and keep native nodes', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    await setPr(context, { splitOverview: false });
    const page = await open(context, { overview: prOverviewHtml() }, '', 360);
    await tagNatives(page);
    await expect(page.locator('[data-ado-pr]')).toHaveAttribute('data-ado-pr', /rail/);
    // The native filter is switched to Active comments once, without scrolling the page to the dropdown.
    await expect(page.locator('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])')).toHaveText('Active comments (2)');
    expect(await page.locator('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])').evaluate(node =>
      node.getBoundingClientRect().top + document.querySelector('.repos-pr-details-page')!.scrollTop)).toBeGreaterThan(360);
    await expect(page.locator('tr[data-fixture-kind="push"]').first()).toBeHidden();
    await expect(page.locator('.bolt-callout')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __fixtureFilterOpens: number }).__fixtureFilterOpens)).toBe(1);
    await expect(page.locator('.repos-pr-details-page')).toHaveJSProperty('scrollTop', 0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])'))).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Merge status sits at the top of the right sidebar, aligned with it.
    const status = await box(page, '[data-fixture="status"]');
    const rail = await box(page, '.repos-overview-right-pane');
    expect(Math.abs(status.left - rail.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(status.width - rail.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(status.top - rail.top)).toBeLessThanOrEqual(1);
    const reviewers = await box(page, '[data-fixture="reviewers"]');
    expect(reviewers.top).toBeGreaterThanOrEqual(status.bottom + 12);
    // The description now starts at the top of the left column.
    const description = await box(page, '.repos-pr-description-card');
    expect(Math.abs(description.top - status.top)).toBeLessThanOrEqual(8);
    // Expand grows the card leftward to the full content width; Collapse puts it back.
    await page.getByRole('button', { name: 'Expand merge status to full width', exact: true }).click();
    const row = await box(page, '[data-ado-pr-row]');
    await expect.poll(async () => (await box(page, '[data-fixture="status"]')).width).toBeGreaterThan(row.width - 2);
    const wide = await box(page, '[data-fixture="status"]');
    expect(Math.abs(wide.left - row.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(wide.right - rail.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(wide.top - status.top)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Show merge status in the sidebar', exact: true }).click();
    await expect.poll(async () => Math.round((await box(page, '[data-fixture="status"]')).width)).toBe(Math.round(rail.width));
    // Work items before tags.
    expect((await box(page, '[data-fixture="workitems"]')).top).toBeLessThan((await box(page, '[data-fixture="tags"]')).top);
    // Passed checks fold into a button; failing and pending stay.
    await expect(page.locator('[data-fixture="passed-a"]')).toBeHidden();
    await expect(page.locator('[data-fixture="passed-b"]')).toBeHidden();
    await expect(page.locator('[data-fixture="failed"]')).toBeVisible();
    await expect(page.locator('[data-fixture="reviewers-policy"]')).toBeVisible();
    const passed = page.getByRole('button', { name: '2 passed', exact: true });
    await expect(passed).toHaveAttribute('aria-expanded', 'false');
    await passed.click();
    await expect(page.locator('[data-fixture="passed-b"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide 2 passed', exact: true })).toHaveAttribute('aria-expanded', 'true');
    // Silent optional reviewers fold; the approver stays.
    await expect(page.locator('[data-fixture-reviewer="Sample Approver"]')).toBeVisible();
    await expect(page.locator('[data-fixture-reviewer="Sample Reviewer A"]')).toBeHidden();
    await page.getByRole('button', { name: '+5 with no vote', exact: true }).click();
    await expect(page.locator('[data-fixture-reviewer="Sample Reviewer E"]')).toBeVisible();
    await page.getByRole('button', { name: 'Hide 5 with no vote', exact: true }).click();
    await expect(page.locator('[data-fixture-reviewer="Sample Reviewer E"]')).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __fixtureFilterOpens: number }).__fixtureFilterOpens)).toBe(1);
    // Compact header.
    expect((await box(page, '.repos-pr-details-page-tabbar')).height).toBeLessThanOrEqual(40.5);
    expect(await nativesIntact(page)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __fixtureMutations?: number }).__fixtureMutations ?? 0)).toBe(0);
    await page.screenshot({ path: info.outputPath('pr-overview.png') });

    const popup = await popupFor(context, page);
    await expect(popup.getByRole('button', { name: 'PR', exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Compact header', 'Merge status in sidebar', 'Collapse passed checks', 'Collapse silent reviewers', 'Start on active comments']) {
      await expect(popup.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(popup.locator('p[role="status"]')).toContainText('2 passed folded');
    await popup.locator('.popup').screenshot({ path: info.outputPath('pr-popup.png') });

    // Turning the sidebar option off puts the card back in place without touching the others.
    await popup.getByRole('button', { name: 'Merge status in sidebar', exact: true }).click();
    await expect.poll(async () => (await stored(context)).pr.railStatus).toBe(false);
    await expect(page.locator('[data-fixture="status"]')).not.toHaveAttribute('data-ado-pr-placed');
    await expect.poll(async () => (await box(page, '[data-fixture="status"]')).left).toBeLessThan((await box(page, '.repos-overview-right-pane')).left - 100);
    await expect(page.locator('[data-fixture="passed-a"]')).toBeVisible();

    // The master switch restores the native page completely.
    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect.poll(async () => (await stored(context)).enabled).toBe(false);
    await expect(page.locator('[data-ado-pr],[data-ado-pr-status],[data-ado-pr-passed],[data-ado-pr-silent],[data-ado-pr-order],[data-ado-pr-wide]')).toHaveCount(0);
    await expect(page.locator('[data-ado-pr-ui],style[data-ado-pr-style]')).toHaveCount(0);
    await expect(page.locator('[data-fixture-reviewer="Sample Reviewer A"]')).toBeVisible();
    expect((await box(page, '.repos-pr-details-page-tabbar')).height).toBeGreaterThanOrEqual(47.5);
    expect(await nativesIntact(page)).toBe(true);
    // The filter is a one-time default; it is not reverted.
    await expect(page.locator('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])')).toHaveText('Active comments (2)');
  } finally { await context.close(); }
});

test('PR overview: a filter that is already not "Show everything" is kept, and dark theme buttons stay readable', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    await setPr(context, { splitOverview: false });
    const page = await open(context, { overview: prOverviewHtml({ dark: true, filter: 'all_comments' }) });
    await expect(page.getByRole('button', { name: '2 passed', exact: true })).toBeVisible();
    await expect(page.locator('.bolt-callout')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __fixtureFilterOpens?: number }).__fixtureFilterOpens ?? 0)).toBe(1);
    await expect(page.locator('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])')).toHaveText('All comments (4)');
    const colors = await page.getByRole('button', { name: '2 passed', exact: true }).evaluate(node => {
      const parse = (value: string) => (value.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const luminance = ([r, g, b]: number[]) => [r, g, b].map(v => { const c = (v ?? 0) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const fg = luminance(parse(getComputedStyle(node).color));
      const bg = luminance(parse(getComputedStyle(node.closest('.bolt-card')!).backgroundColor));
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(colors).toBeGreaterThanOrEqual(4.5);
    const popup = await popupFor(context, page);
    await expect(popup.locator('p[role="status"]')).toContainText('your filter kept');
  } finally { await context.close(); }
});

test('PR overview: unknown structures stay native and are reported', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    await setPr(context, { splitOverview: false });
    const page = await open(context, { overview: prOverviewHtml({ unknownStatus: true }) });
    await expect(page.locator('[data-ado-pr]')).toHaveAttribute('data-ado-pr', /reviewers/);
    await expect(page.locator('[data-ado-pr-placed],[data-ado-pr-passed]')).toHaveCount(0);
    const popup = await popupFor(context, page);
    await expect(popup.getByRole('alert')).toContainText('Merge status in sidebar');
    await expect(popup.getByRole('alert')).toContainText('Collapse passed checks');
  } finally { await context.close(); }
});

test('PR files: comment rows leave the tree, indentation halves, and both restore', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    const page = await open(context, {}, '?_a=files');
    await expect(page.locator('[data-ado-pr]')).toHaveAttribute('data-ado-pr', /tree-comments/);
    await expect(page.locator('tr[data-fixture-tree="comment"]')).toHaveCount(2);
    await expect(page.locator('tr[data-fixture-tree="comment"]').first()).toBeHidden();
    const deep = page.locator('tr[aria-level="5"] .bolt-tree-expand-button').first();
    await expect.poll(() => deep.evaluate(node => getComputedStyle(node).marginLeft)).toBe('32px');
    expect((await box(page, '.repos-compare-toolbar')).height).toBeLessThanOrEqual(70);
    const popup = await popupFor(context, page);
    await expect(popup.getByRole('tab', { name: /Files/ })).toHaveAttribute('aria-selected', 'true');
    await expect(popup.locator('p[role="status"]')).toContainText('2 comment rows hidden');
    await popup.getByRole('button', { name: 'Hide comments in file tree', exact: true }).click();
    await expect(page.locator('tr[data-fixture-tree="comment"]').first()).toBeVisible();
    await popup.getByRole('button', { name: 'Compact file tree', exact: true }).click();
    await expect.poll(() => deep.evaluate(node => getComputedStyle(node).marginLeft)).toBe('64px');
    await popup.getByRole('button', { name: 'Reset to kiwifruit', exact: true }).click();
    await expect(page.locator('tr[data-fixture-tree="comment"]').first()).toBeHidden();
    await expect.poll(() => deep.evaluate(node => getComputedStyle(node).marginLeft)).toBe('32px');
  } finally { await context.close(); }
});

test('PR tabs and header: kiwifruit hides chosen tabs and avatars, the current tab always stays, and popup toggles work', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    const page = await open(context);
    await tagNatives(page);
    for (const id of ['updates', 'ms-1es-Agency-sessions', 'XScenarios-PRInsights-Extension-PRInsights-Extension-Feature']) {
      await expect(page.locator(`#__bolt-tab-${id}`)).toBeHidden();
    }
    for (const id of ['overview', 'files', 'commits', 'microsoft-wdg-es-stream-scm-owners-owners-tab']) {
      await expect(page.locator(`#__bolt-tab-${id}`)).toBeVisible();
    }
    await expect(page.locator('[data-fixture="avatars"]')).toBeHidden();
    await expect(page.locator('[data-fixture="title-meta"]')).toBeVisible();
    const popup = await popupFor(context, page);
    await popup.getByRole('tab', { name: 'Tabs' }).click();
    const list = popup.getByRole('region', { name: 'Visible pull request tabs' });
    await expect(list.getByText('current', { exact: true })).toBeVisible();
    await expect(list.getByRole('button', { name: 'Overview' })).toBeVisible();
    await expect(list.getByRole('button', { name: 'Agency Sessions' })).toHaveAttribute('aria-pressed', 'false');
    await list.getByRole('button', { name: 'Owners' }).click();
    await expect.poll(async () => (await stored(context)).pr.hiddenTabs).toContain('microsoft-wdg-es-stream-scm-owners-owners-tab');
    await expect(page.locator('#__bolt-tab-microsoft-wdg-es-stream-scm-owners-owners-tab')).toBeHidden();
    await list.getByRole('button', { name: 'Agency Sessions' }).click();
    await expect(page.locator('#__bolt-tab-ms-1es-Agency-sessions')).toBeVisible();
    await popup.locator('.popup-body').evaluate(node => { node.scrollTop = 0; });
    await popup.locator('.popup').screenshot({ path: info.outputPath('pr-popup-tabs.png') });
    expect(await nativesIntact(page)).toBe(true);
    // A hidden tab opened directly stays visible while it is current.
    await page.goto(`${ADDRESS}?_a=updates`);
    await expect(page.locator('#__bolt-tab-updates')).toBeVisible();
    await expect(page.locator('#__bolt-tab-XScenarios-PRInsights-Extension-PRInsights-Extension-Feature')).toBeHidden();
  } finally { await context.close(); }
});

test('PR description: long text folds behind Show more and opens fully while editing', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    await setPr(context, { splitOverview: false });
    const page = await open(context);
    const body = '.repos-pr-description';
    await expect(page.getByRole('button', { name: 'Show more', exact: true })).toBeVisible();
    expect((await box(page, body)).height).toBeLessThanOrEqual(241);
    await page.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect.poll(async () => (await box(page, body)).height).toBeGreaterThan(300);
    await page.getByRole('button', { name: 'Show less', exact: true }).click();
    await expect.poll(async () => (await box(page, body)).height).toBeLessThanOrEqual(241);
    await page.getByRole('button', { name: 'Edit description' }).click();
    await expect(page.locator('textarea.repos-description-editor')).toBeFocused();
    await expect(page.locator('[data-ado-pr-fold]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Show (more|less)/ })).toHaveCount(0);
  } finally { await context.close(); }
});

test('PR feed: pushes show only their header until Show commits', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    await setPr(context, { activeComments: false, foldUpdates: false });
    const page = await open(context);
    await tagNatives(page);
    const push = page.locator('[data-fixture-push="12"]');
    await expect(push.getByText('Sample Author pushed 3 commits')).toBeVisible();
    await expect(page.locator('[data-fixture-commits="12"]')).toBeHidden();
    await expect(page.locator('[data-fixture-all-commits="12"]')).toBeHidden();
    // Header-only pushes get no button.
    await expect(page.locator('[data-fixture-push="10"]').getByRole('button')).toHaveCount(0);
    await push.getByRole('button', { name: 'Show commits', exact: true }).click();
    await expect(page.locator('[data-fixture-commits="12"]')).toBeVisible();
    await expect(page.locator('[data-fixture-all-commits="12"]')).toBeVisible();
    await expect(page.locator('[data-fixture-commits="11"]')).toBeHidden();
    await push.getByRole('button', { name: 'Hide commits', exact: true }).click();
    await expect(page.locator('[data-fixture-commits="12"]')).toBeHidden();
    expect(await nativesIntact(page)).toBe(true);
    const popup = await popupFor(context, page);
    await popup.getByRole('button', { name: 'Compact pushes', exact: true }).click();
    await expect(page.locator('[data-fixture-commits="12"]')).toBeVisible();
    await expect(push.getByRole('button', { name: /commits/ })).toHaveCount(0);
  } finally { await context.close(); }
});

test('PR feed: update runs fold, blocked authors fold behind one button, and runs join across hidden threads', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    await setPr(context, { activeComments: false });
    const page = await open(context);
    await tagNatives(page);
    const row = (index: number) => `tr[data-fixture-row="${index}"]`;
    // Runs: rows 6-8 (push, system, push) and 10-11 (push, push). The placeholder and composer never fold.
    await expect(page.getByRole('button', { name: '+2 more updates', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '+1 more updates', exact: true })).toBeVisible();
    for (const index of [7, 8, 11]) expect(await hidden(page, row(index))).toBe(true);
    for (const index of [0, 1, 2, 3, 6, 10, 12]) expect(await hidden(page, row(index))).toBe(false);
    await page.getByRole('button', { name: '+2 more updates', exact: true }).click();
    await expect.poll(() => hidden(page, row(8))).toBe(false);
    await page.getByRole('button', { name: 'Hide 2 updates', exact: true }).click();
    await expect.poll(() => hidden(page, row(8))).toBe(true);

    const popup = await popupFor(context, page);
    await popup.getByRole('tab', { name: 'Blocked' }).click();
    const list = popup.getByRole('region', { name: 'Blocked comment authors' });
    await expect(list.getByText('2 threads')).toBeVisible();
    await list.getByRole('button', { name: 'Sample Bot', exact: true }).click();
    await expect.poll(async () => (await stored(context)).pr.blockedAuthors).toEqual(['Sample Bot']);
    // Only the closed bot thread folds; its active thread stays visible.
    await expect.poll(() => hidden(page, row(9))).toBe(true);
    expect(await hidden(page, row(5))).toBe(false);
    const summary = page.getByRole('button', { name: '1 from blocked authors', exact: true });
    await expect(summary).toBeVisible();
    // With the closed bot thread folded, rows 6-11 are one run behind the first push.
    await expect(page.getByRole('button', { name: '+4 more updates', exact: true })).toBeVisible();
    await summary.click();
    await expect.poll(() => hidden(page, row(9))).toBe(false);
    await expect(page.getByRole('button', { name: 'Hide 1 from blocked authors', exact: true })).toBeVisible();
    // Our button inside the filter wrapper does not count as choosing a filter.
    await expect(page.locator('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])')).toHaveText('Show everything (11)');
    await popup.locator('.popup').screenshot({ path: info.outputPath('pr-popup-blocked.png') });
    expect(await nativesIntact(page)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __fixtureMutations?: number }).__fixtureMutations ?? 0)).toBe(0);

    await popup.getByRole('button', { name: 'Enable ADOverride', exact: true }).click();
    await expect(page.locator('[data-ado-pr-hide],[data-ado-pr-fold],[data-ado-pr-ui]')).toHaveCount(0);
    for (const index of [5, 7, 8, 9, 11]) await expect.poll(() => hidden(page, row(index))).toBe(false);
    await expect(page.locator('#__bolt-tab-updates')).toBeVisible();
    expect(await nativesIntact(page)).toBe(true);
  } finally { await context.close(); }
});

test('PR files: blocked authors leave the tree and their inline threads fold', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    await setPr(context, { hideTreeComments: false });
    const page = await open(context, {}, '?_a=files');
    await expect(page.locator('tr[data-fixture-tree="comment"]').first()).toBeVisible();
    const popup = await popupFor(context, page);
    await popup.getByRole('tab', { name: 'Blocked' }).click();
    await popup.getByRole('textbox', { name: 'Author display name' }).fill('  sample   bot ');
    await popup.getByRole('button', { name: 'Block', exact: true }).click();
    await expect.poll(async () => (await stored(context)).pr.blockedAuthors).toEqual(['sample bot']);
    const bot = page.locator('[data-fixture-inline="Sample Bot"]');
    await expect(bot.locator('.repos-discussion-thread')).toBeHidden();
    // Tree rows carry no thread state, so blocking leaves them; the active bot thread stays too.
    await expect(page.locator('tr[data-fixture-tree="comment"]').first()).toBeVisible();
    await expect(page.locator('[data-fixture-inline="Sample Bot active"] .repos-discussion-thread')).toBeVisible();
    await expect(page.locator('[data-fixture-inline="Sample Reviewer"] .repos-discussion-thread')).toBeVisible();
    await bot.getByRole('button', { name: 'Comment from a blocked author', exact: true }).click();
    await expect(bot.locator('.repos-discussion-thread')).toBeVisible();
    await expect(popup.locator('p[role="status"]')).toContainText('1 from blocked authors');
    await popup.getByRole('textbox', { name: 'Author display name' }).fill('Sample Bot');
    await popup.getByRole('button', { name: 'Block', exact: true }).click();
    await expect(popup.getByText('Already blocked.')).toBeVisible();
    // Reset keeps the block list.
    await popup.getByRole('button', { name: 'Reset to kiwifruit', exact: true }).click();
    await expect.poll(async () => (await stored(context)).pr.hideTreeComments).toBe(true);
    expect((await stored(context)).pr.blockedAuthors).toEqual(['sample bot']);
  } finally { await context.close(); }
});

test('PR blocked list: authors of threads hidden by the native filter appear once they load, and stay listed', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    const page = await open(context, { overview: prOverviewHtml({ filter: 'active_comments' }) });
    const trigger = page.locator('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])');
    await expect(trigger).toHaveText('Active comments (2)');
    const popup = await popupFor(context, page);
    await popup.getByRole('tab', { name: 'Blocked' }).click();
    const list = popup.getByRole('region', { name: 'Blocked comment authors' });
    await expect(list.getByRole('button', { name: 'Sample Bot', exact: true })).toBeVisible();
    // Sample Author only has a resolved thread, which the Active comments filter does not render.
    await expect(list.getByRole('button', { name: 'Sample Author', exact: true })).toHaveCount(0);
    await page.bringToFront();
    await trigger.click();
    await page.locator('#__bolt-everything').click();
    await expect(trigger).toHaveText('Show everything (11)');
    await trigger.click();
    await page.locator('#__bolt-active_comments').click();
    await expect(trigger).toHaveText('Active comments (2)');
    await expect(list.getByRole('button', { name: 'Sample Author', exact: true })).toBeVisible();
    await expect(list.getByRole('button', { name: 'Sample Bot', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('PR split overview: Activity, Description and Checks tabs show their parts, remember the last tab, and restore', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    const page = await open(context);
    await tagNatives(page);
    const tablist = page.locator('.repos-pr-details-page-tabbar [role="tablist"]');
    // Native order with ours right after Overview, which reads Activity.
    await expect(tablist.locator(':scope > [role="tab"]').nth(1)).toHaveText('Description');
    await expect(tablist.locator(':scope > [role="tab"]').nth(2)).toHaveText(/^Checks/);
    expect(await page.locator('#__bolt-tab-overview .bolt-tab-text').evaluate(node => getComputedStyle(node, '::before').content)).toBe('"Activity"');
    const checksTab = tablist.getByRole('tab', { name: /^Checks/ });
    await expect(checksTab.locator('.ado-pr-badge')).toHaveText('1 failed');
    // Activity: the feed takes the full row; description, checks and sidebar are hidden.
    await expect(page.locator('.repos-overview-right-pane')).toBeHidden();
    await expect(page.locator('[data-fixture="status"]')).toBeHidden();
    await expect(page.locator('.repos-pr-description-card')).toBeHidden();
    const row = await box(page, '.page-content > .flex-row');
    expect((await box(page, 'table.activity-feed-list')).width).toBeGreaterThan(row.width - 40);
    // Description: description with work items and tags.
    await tablist.getByRole('tab', { name: 'Description' }).click();
    await expect(tablist.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.repos-pr-description-card')).toBeVisible();
    await expect(page.locator('[data-fixture="workitems"]')).toBeVisible();
    await expect(page.locator('[data-fixture="tags"]')).toBeVisible();
    for (const selector of ['[data-fixture="reviewers"]', '[data-fixture="status"]', 'table.activity-feed-list', '.repos-activity-filter-dropdown']) {
      await expect(page.locator(selector)).toBeHidden();
    }
    expect(await page.locator('#__bolt-tab-overview .bolt-tab-inner-container').evaluate(node => getComputedStyle(node).borderBottomColor)).toBe('rgba(0, 0, 0, 0)');
    // Blocks stack, each spanning the row.
    {
      const row = await box(page, '.page-content > .flex-row');
      const card = await box(page, '.repos-pr-description-card');
      const items = await box(page, '[data-fixture="workitems"]');
      expect(card.width).toBeGreaterThan(row.width - 16);
      expect(items.width).toBeGreaterThan(row.width - 16);
      expect(items.y).toBeGreaterThanOrEqual(card.y + card.height);
    }
    // The description is not folded on its own tab.
    await expect(page.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
    // Checks: merge status with reviewers.
    await checksTab.click();
    await expect(page.locator('[data-fixture="status"]')).toBeVisible();
    await expect(page.locator('[data-fixture="reviewers"]')).toBeVisible();
    for (const selector of ['[data-fixture="workitems"]', '[data-fixture="tags"]', '.repos-pr-description-card', 'table.activity-feed-list']) {
      await expect(page.locator(selector)).toBeHidden();
    }
    {
      const row = await box(page, '.page-content > .flex-row');
      const status = await box(page, '[data-fixture="status"]');
      const reviewers = await box(page, '[data-fixture="reviewers"]');
      expect(status.width).toBeGreaterThan(row.width - 16);
      expect(reviewers.width).toBeGreaterThan(row.width - 16);
      expect(reviewers.y).toBeGreaterThanOrEqual(status.y + status.height);
    }
    await page.screenshot({ path: info.outputPath('pr-split-checks.png') });
    expect(await nativesIntact(page)).toBe(true);
    // The last tab is remembered across loads.
    await page.reload();
    await expect(page.locator('[data-fixture="status"]')).toBeVisible();
    await expect(page.locator('table.activity-feed-list')).toBeHidden();
    // The native tab returns to Activity.
    await page.locator('#__bolt-tab-overview').click();
    await expect(page.locator('table.activity-feed-list')).toBeVisible();
    await expect(page.locator('[data-fixture="status"]')).toBeHidden();
    // From Files, Description goes to Overview on the Description tab.
    await page.goto(`${ADDRESS}?_a=files`);
    await expect(page.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'false');
    await page.getByRole('tab', { name: 'Description' }).click();
    await expect(page).toHaveURL(/_a=overview/);
    await expect(page.locator('.repos-pr-description-card')).toBeVisible();
    await expect(page.locator('table.activity-feed-list')).toBeHidden();
    // Turning the option off restores the native layout and removes our tabs.
    const popup = await popupFor(context, page);
    await popup.getByRole('button', { name: 'Split Overview into tabs', exact: true }).click();
    await expect(page.locator('[data-ado-pr-tab]')).toHaveCount(0);
    await expect(page.locator('table.activity-feed-list')).toBeVisible();
    await expect(page.locator('.repos-overview-right-pane')).toBeVisible();
    await expect(page.locator('[data-ado-pr-view],[data-ado-pr-part]')).toHaveCount(0);
    expect((await box(page, '.repos-overview-right-pane')).width).toBe(340);
    expect(await page.locator('#__bolt-tab-overview .bolt-tab-text').evaluate(node => getComputedStyle(node, '::before').content)).toBe('"Overview"');
  } finally { await context.close(); }
});
