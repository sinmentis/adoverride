import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { Resvg } from '@resvg/resvg-js';
import { createServer } from 'vite';

const extension = path.resolve('.output/chrome-mv3');
const origin = 'https://dev.azure.com';
const store = process.argv.includes('--store');
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

function gallery(panels, width, height) {
  const padding = 24;
  const gap = 32;
  const label = 40;
  const totalWidth = panels.length * width + (panels.length - 1) * gap + padding * 2;
  const totalHeight = height + label + padding * 2;
  const body = panels.map(({ title, image }, index) => {
    const x = padding + index * (width + gap);
    return `<text x="${x}" y="${padding + 24}" font-size="18" font-weight="600">${title}</text>
      <image x="${x}" y="${padding + label}" width="${width}" height="${height}" href="data:image/png;base64,${image.toString('base64')}"/>
      <rect x="${x}" y="${padding + label}" width="${width}" height="${height}" rx="8" fill="none" stroke="#d0d7de"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
    <rect width="100%" height="100%" fill="#f6f8fa"/>
    <g font-family="DejaVu Sans" fill="#1f2328">${body}</g>
  </svg>`;
  return new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, font: { loadSystemFonts: true } }).render().asPng();
}

try {
  if (store) await mkdir('docs/store', { recursive: true });
  const { presentationBoardHtml } = await loader.ssrLoadModule('/tests/browser/board-presentation-fixture.ts');
  const { workspaceTicketHtml } = await loader.ssrLoadModule('/tests/browser/workspace-fixture.ts');
  const { prOverviewHtml } = await loader.ssrLoadModule('/tests/browser/pr-fixture.ts');
  const { TICKET_LAYOUT } = await loader.ssrLoadModule('/tests/browser/ticket-fixtures.ts');
  const { defaultPreferences } = await loader.ssrLoadModule('/lib/preferences.ts');
  const preferences = defaultPreferences();
  const key = `ado-customize.preferences.v${preferences.version}`;
  let html = presentationBoardHtml(false).replaceAll('Sample Owner', 'Unassigned');

  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: store ? { width: 1280, height: 800 } : { width: 1536, height: 825 },
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
  const popupUrl = `chrome-extension://${new URL(worker.url()).host}/popup.html`;
  const popupShot = async setup => {
    const popup = await context.newPage();
    const cdp = await context.newCDPSession(popup);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 480, deviceScaleFactor: 2, mobile: false });
    await page.bringToFront();
    await popup.goto(popupUrl);
    await setup(popup);
    await popup.mouse.move(339, 479);
    await popup.waitForTimeout(300);
    const image = await popup.locator('.popup').screenshot({ animations: 'disabled', caret: 'initial' });
    await popup.close();
    return image;
  };
  const storeShot = async (name, popupImage) => {
    const overlay = popupImage ? await page.evaluateHandle(data => {
      const image = document.createElement('img');
      image.src = `data:image/png;base64,${data}`;
      image.alt = 'ADOverride popup';
      Object.assign(image.style, {
        position: 'fixed', top: '16px', right: '16px', width: '340px', height: '480px',
        zIndex: '2147483647', boxShadow: '0 6px 24px #0004',
        border: '1px solid #d0d7de', background: 'white',
      });
      document.body.append(image);
      return image;
    }, popupImage.toString('base64')) : null;
    try {
      if (overlay) await overlay.evaluate(image => image.decode());
      await page.screenshot({
        path: `docs/store/${name}.jpg`, type: 'jpeg', quality: 95,
        animations: 'disabled', caret: 'hide',
      });
    } finally {
      if (overlay) {
        await overlay.evaluate(image => image.remove());
        await overlay.dispose();
      }
    }
  };
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
  expect(await boardGeometry()).toBeGreaterThan(store ? 100 : 250);
  const boardClip = store ? { x: 0, y: 0, width: 1280, height: 800 } : { x: 32, y: 32, width: 1504, height: 592 };
  const beforeBoard = await page.screenshot({ clip: boardClip, caret: 'initial', animations: 'disabled' });
  await enabled(true);
  await expect.poll(boardGeometry).toBeLessThanOrEqual(4.1);
  await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toBeHidden();
  const afterBoard = await page.screenshot({ clip: boardClip, caret: 'initial', animations: 'disabled' });
  if (!store) await writeFile('docs/images/board-before-after.png', comparison(beforeBoard, afterBoard, 1504, 592));
  const libraryPopup = await popupShot(async popup => {
    await expect(popup.getByRole('tab', { name: 'Board layout', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(popup.getByText(/^Equal widths\./)).toBeVisible();
  });
  if (store) {
    await storeShot('01-board', libraryPopup);
  }

  await enabled(false);
  html = workspaceTicketHtml(false, false);
  await page.goto(`${origin}/example/Platform/_workitems/edit/101`);
  const description = page.getByRole('textbox', { name: 'Description draft', exact: true });
  const draft = 'Make the release workflow easy to use.\n\nKeep the main reading area wide and put routine fields in one place.\n\nSave drafts and use the native controls as usual.';
  await description.fill(draft);
  const draftMarkup = await description.innerHTML();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Make the release workflow easier to use');
  await page.mouse.move(0, 0);
  const ticketClip = { x: 0, y: 0, width: store ? 1280 : 1536, height: 800 };
  const beforeTicket = await page.screenshot({ clip: ticketClip, caret: 'initial', animations: 'disabled' });
  await enabled(true);
  await expect(page.locator('[data-ado-ticket-workspace-shell]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
  await expect.poll(() => description.innerHTML()).toBe(draftMarkup);
  await page.mouse.move(0, 0);
  const afterTicket = await page.screenshot({ clip: ticketClip, caret: 'initial', animations: 'disabled' });
  if (store) await storeShot('02-workspace');
  else await writeFile('docs/images/ticket-before-after.png', comparison(beforeTicket, afterTicket, 1536, 800));
  const cardsPopup = await popupShot(async popup => {
    await popup.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Show Description', exact: true })).toBeVisible();
  });
  const layoutPopup = await popupShot(async popup => {
    await popup.getByRole('tab', { name: 'Layout', exact: true }).click();
    await expect(popup.getByRole('radio', { name: 'Workspace', exact: true })).toBeChecked();
  });
  if (store) {
    await storeShot('03-ticket-fields', cardsPopup);
    await storeShot('04-ticket-layout', layoutPopup);
    html = prOverviewHtml();
    await page.goto(`${origin}/example/Platform/_git/service/pullrequest/42`);
    await expect(page.locator('[data-ado-pr-tab]')).toHaveCount(2);
    await expect(page.locator('.repos-activity-filter-dropdown > button:not([data-ado-pr-ui])')).toHaveText('Active comments (2)');
    await page.locator('[data-ado-pr-tab="checks"]').click();
    await expect(page.locator('[data-ado-pr-view]')).toHaveAttribute('data-ado-pr-view', 'checks');
    await expect(page.locator('[data-fixture="status"]')).toBeVisible();
    await expect(page.locator('[data-fixture="reviewers"]')).toBeVisible();
    await expect(page.locator('.activity-feed-list')).toBeHidden();
    await expect.poll(() => page.locator('[data-fixture="status"]').evaluate(element => element.getBoundingClientRect().width))
      .toBeGreaterThan(1200);
    expect(await page.evaluate(() => window.__fixtureMutations ?? 0)).toBe(0);
    await storeShot('05-pull-request');
  } else {
    await writeFile('docs/images/popup.png', gallery([
      { title: 'Ticket: cards &amp; fields', image: cardsPopup },
      { title: 'Ticket: layout', image: layoutPopup },
      { title: 'Board layout', image: libraryPopup },
    ], 340, 480));
  }
  console.log(`Updated ${store ? 'Chrome Web Store' : 'README'} images from the production extension and fictional fixtures.`);
} finally {
  await context?.close();
  await loader.close();
  await rm(profile, { recursive: true });
}
