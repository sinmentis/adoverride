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
    const body = url.searchParams.get('_a') === 'files' ? html.files ?? prFilesHtml() : html.overview ?? prOverviewHtml();
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
function box(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(node => node.getBoundingClientRect().toJSON() as DOMRect);
}
async function tagNatives(page: Page) {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-fixture],[data-fixture-reviewer],.repos-activity-filter-dropdown>button,tr.bolt-timeline-row')];
    (window as unknown as { __natives: [Element, Element | null][] }).__natives = nodes.map(node => [node, node.parentElement]);
  });
}
function nativesIntact(page: Page) {
  return page.evaluate(() => (window as unknown as { __natives: [Element, Element | null][] }).__natives
    .every(([node, parent]) => node.isConnected && node.parentElement === parent));
}

test('PR overview: kiwifruit defaults fold noise, move merge status to the sidebar and keep native nodes', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    const page = await open(context, { overview: prOverviewHtml() }, '', 640);
    await tagNatives(page);
    await expect(page.locator('[data-ado-pr]')).toHaveAttribute('data-ado-pr', /rail/);
    // The native filter is switched to Active comments once, without scrolling the page to the dropdown.
    await expect(page.locator('.repos-activity-filter-dropdown > button')).toHaveText('Active comments (2)');
    expect(await page.locator('.repos-activity-filter-dropdown > button').evaluate(node =>
      node.getBoundingClientRect().top + document.querySelector('.repos-pr-details-page')!.scrollTop)).toBeGreaterThan(640);
    await expect(page.locator('tr[data-fixture-kind="push"]').first()).toBeHidden();
    await expect(page.locator('.bolt-callout')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __fixtureFilterOpens: number }).__fixtureFilterOpens)).toBe(1);
    await expect(page.locator('.repos-pr-details-page')).toHaveJSProperty('scrollTop', 0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector('.repos-activity-filter-dropdown > button'))).toBe(false);
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
    await expect(popup.getByRole('status')).toContainText('2 passed folded');
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
    await expect(page.locator('[data-ado-pr],[data-ado-pr-status],[data-ado-pr-passed],[data-ado-pr-silent],[data-ado-pr-order]')).toHaveCount(0);
    await expect(page.locator('[data-ado-pr-ui],style[data-ado-pr-style]')).toHaveCount(0);
    await expect(page.locator('[data-fixture-reviewer="Sample Reviewer A"]')).toBeVisible();
    expect((await box(page, '.repos-pr-details-page-tabbar')).height).toBeGreaterThanOrEqual(47.5);
    expect(await nativesIntact(page)).toBe(true);
    // The filter is a one-time default; it is not reverted.
    await expect(page.locator('.repos-activity-filter-dropdown > button')).toHaveText('Active comments (2)');
  } finally { await context.close(); }
});

test('PR overview: a filter that is already not "Show everything" is kept, and dark theme buttons stay readable', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
    const page = await open(context, { overview: prOverviewHtml({ dark: true, filter: 'all_comments' }) });
    await expect(page.getByRole('button', { name: '2 passed', exact: true })).toBeVisible();
    await expect(page.locator('.bolt-callout')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __fixtureFilterOpens?: number }).__fixtureFilterOpens ?? 0)).toBe(1);
    await expect(page.locator('.repos-activity-filter-dropdown > button')).toHaveText('All comments (3)');
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
    await expect(popup.getByRole('status')).toContainText('your filter kept');
  } finally { await context.close(); }
});

test('PR overview: unknown structures stay native and are reported', async ({}, info) => {
  const { context } = await launch(info.outputPath('profile'));
  try {
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
    await expect(popup.getByRole('status')).toContainText('2 comment rows hidden');
    await popup.getByRole('button', { name: 'Hide comments in file tree', exact: true }).click();
    await expect(page.locator('tr[data-fixture-tree="comment"]').first()).toBeVisible();
    await popup.getByRole('button', { name: 'Compact file tree', exact: true }).click();
    await expect.poll(() => deep.evaluate(node => getComputedStyle(node).marginLeft)).toBe('64px');
    await popup.getByRole('button', { name: 'Reset to kiwifruit', exact: true }).click();
    await expect(page.locator('tr[data-fixture-tree="comment"]').first()).toBeHidden();
    await expect.poll(() => deep.evaluate(node => getComputedStyle(node).marginLeft)).toBe('32px');
  } finally { await context.close(); }
});
