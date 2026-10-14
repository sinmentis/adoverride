import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { Resvg } from '@resvg/resvg-js';
import { createServer } from 'vite';

const extension = path.resolve('.output/chrome-mv3');
const origin = 'https://dev.azure.com';
const loader = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
});
const profile = await mkdtemp(path.join(os.tmpdir(), 'adoverride-screenshots-'));
let context;

function comparison(before, after, width, height) {
  const padding = 24;
  const gap = 24;
  const label = 48;
  const totalWidth = width * 2 + padding * 2 + gap;
  const totalHeight = height + label + padding * 2;
  const panels = [before, after].map((image, index) => {
    const x = padding + index * (width + gap);
    return `<text x="${x}" y="${padding + 28}" font-size="24" font-weight="600">${index ? 'After: ADOverride' : 'Before: Azure DevOps'}</text>
      <image x="${x}" y="${padding + label}" width="${width}" height="${height}" href="data:image/png;base64,${image.toString('base64')}"/>
      <rect x="${x}" y="${padding + label}" width="${width}" height="${height}" rx="4" fill="none" stroke="#d0d7de"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
    <rect width="100%" height="100%" fill="#f6f8fa"/>
    <g font-family="DejaVu Sans" fill="#1f2328">${panels}</g>
  </svg>`;
  return new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
}

try {
  const { presentationBoardHtml } = await loader.ssrLoadModule('/tests/browser/board-presentation-fixture.ts');
  const { workspaceTicketHtml } = await loader.ssrLoadModule('/tests/browser/workspace-fixture.ts');
  const { TICKET_LAYOUT } = await loader.ssrLoadModule('/tests/browser/ticket-fixtures.ts');
  const { defaultPreferences } = await loader.ssrLoadModule('/lib/preferences.ts');
  const preferences = defaultPreferences();
  const key = `ado-customize.preferences.v${preferences.version}`;
  let html = presentationBoardHtml(false).replaceAll('Sample Owner', 'Unassigned');

  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1536, height: 825 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await expect.poll(() => worker.evaluate(async key => (await chrome.storage.local.get(key))[key], key)).toBeDefined();
  const enabled = async value => worker.evaluate(async ({ key, value }) => {
    const current = (await chrome.storage.local.get(key))[key];
    await chrome.storage.local.set({ [key]: { ...current, revision: current.revision + 1, enabled: value } });
  }, { key, value });
  await enabled(false);
  await context.route(`${origin}/**`, route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!pathname.includes('/_apis/')) return route.fulfill({ contentType: 'text/html', body: html });
    expect(request.method()).toBe('GET');
    const data = pathname.includes('/workitemtypes/') ? { referenceName: 'Example.UserStory', xmlForm: '<FORM><Layout /></FORM>' } :
      pathname.includes('/projects/') ? { capabilities: { processTemplate: { templateTypeId: 'fixture-process' } } } :
        pathname.endsWith('/layout') ? TICKET_LAYOUT :
          pathname.endsWith('/workItemTypes') ? { value: [{ name: 'User Story', referenceName: 'Example.UserStory' }] } : null;
    if (!data) throw new Error(`Unexpected screenshot metadata request: ${pathname}`);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(`${origin}/example/Platform/_boards/board/t/Team/Stories`);
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('.kanban-board-column-header-container,.kanban-board-content')) {
      for (const [index, column] of [...row.children].entries()) if (index === 1 || index === 3) column.remove();
    }
    const titles = ['Add keyboard shortcuts', 'Improve the search filters', 'Publish the release notes'];
    const states = ['New', 'Active', 'Closed'];
    for (const [index, card] of [...document.querySelectorAll('.wit-card')].entries()) {
      card.querySelector('.bolt-link span').textContent = titles[index];
      card.querySelector('.work-item-state-name span').textContent = states[index];
    }
  });
  const boardGeometry = () => page.evaluate(() => {
    const row = document.querySelector('.kanban-board-content');
    const last = document.querySelector('.kanban-board-content>.kanban-board-column:last-child');
    if (!row || !last) throw new Error('Missing screenshot Board geometry.');
    return row.getBoundingClientRect().right - last.getBoundingClientRect().right;
  });
  expect(await boardGeometry()).toBeGreaterThan(250);
  const boardClip = { x: 32, y: 32, width: 1504, height: 592 };
  const beforeBoard = await page.screenshot({ clip: boardClip, caret: 'initial', animations: 'disabled' });
  await enabled(true);
  await expect.poll(boardGeometry).toBeLessThanOrEqual(4.1);
  await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toBeHidden();
  const afterBoard = await page.screenshot({ clip: boardClip, caret: 'initial', animations: 'disabled' });
  await writeFile('docs/images/board-before-after.png', comparison(beforeBoard, afterBoard, 1504, 592));

  await enabled(false);
  html = workspaceTicketHtml(false, false);
  await page.goto(`${origin}/example/Platform/_workitems/edit/101`);
  const description = page.getByRole('textbox', { name: 'Description draft', exact: true });
  const draft = 'Make the release workflow easy to use.\n\nKeep the main reading area wide and put routine fields in one place.\n\nSave drafts and use the native controls as usual.';
  await description.fill(draft);
  const draftMarkup = await description.innerHTML();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Make the release workflow easier to use');
  await page.mouse.move(0, 0);
  const ticketClip = { x: 0, y: 0, width: 1536, height: 800 };
  const beforeTicket = await page.screenshot({ clip: ticketClip, caret: 'initial', animations: 'disabled' });
  await enabled(true);
  await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
  await expect.poll(() => description.innerHTML()).toBe(draftMarkup);
  await page.mouse.move(0, 0);
  const afterTicket = await page.screenshot({ clip: ticketClip, caret: 'initial', animations: 'disabled' });
  await writeFile('docs/images/ticket-before-after.png', comparison(beforeTicket, afterTicket, 1536, 800));
  console.log('Updated Board and Ticket Before/After images from the production extension and fictional fixtures.');
} finally {
  await context?.close();
  await loader.close();
  await rm(profile, { recursive: true });
}
