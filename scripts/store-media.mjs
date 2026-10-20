import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { chromium } from '@playwright/test';

const directory = new URL('../docs/store/', import.meta.url);
await mkdir(directory, { recursive: true });
const icon = (await readFile(new URL('../public/icon/96.png', import.meta.url))).toString('base64');
const iconImage = (x, y, size) =>
  `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/png;base64,${icon}"/>`;

async function boardHero() {
  const comparison = await readFile(new URL('../docs/images/board-before-after.png', import.meta.url));
  assert.deepEqual(
    [comparison.readUInt32BE(16), comparison.readUInt32BE(20)], [3080, 688],
    'Board comparison dimensions changed; review the hero crop before publishing.',
  );
  const image = comparison.toString('base64');
  // Equal-sized crops align the columns while preserving content and horizontal scale.
  const panel = (sourceX, sourceY, y) => `<svg x="48" y="${y}" width="1184" height="252" viewBox="${sourceX} ${sourceY} 1504 320">
    <image width="3080" height="688" href="data:image/png;base64,${image}"/>
  </svg><rect x="48" y="${y}" width="1184" height="252" rx="4" fill="none" stroke="#d0d7de"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
    <rect width="1280" height="800" fill="#f6f8fa"/>
    <g font-family="DejaVu Sans" fill="#1f2328">
      ${iconImage(48, 20, 28)}
      <text x="88" y="42" font-size="21" font-weight="700">ADOverride</text>
      <text x="48" y="101" font-size="48" font-weight="700">Use your whole board</text>
      <text x="48" y="139" font-size="24" fill="#57606a">Wider Azure DevOps columns. Changes only your view.</text>
      <text x="48" y="179" font-size="22" font-weight="600">Before: unused space on the right</text>
      ${panel(24, 324, 192)}
      <text x="48" y="489" font-size="22" font-weight="600" fill="#0969da">After: columns use the available width</text>
      ${panel(1552, 270, 502)}
      <text x="48" y="783" font-size="15" fill="#57606a">Fictional demo with replayed layouts. Same work items and viewport in both views.</text>
    </g>
  </svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
  assert.equal(png.readUInt32BE(16), 1280);
  assert.equal(png.readUInt32BE(20), 800);
  return png;
}

function artwork(width, height) {
  const marquee = width > 440;
  const scale = marquee ? 1.65 : 1;
  const x = marquee ? 60 : 24;
  const y = marquee ? 96 : 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="background" x2="1" y2="1">
      <stop stop-color="#052b63"/><stop offset="1" stop-color="#0969da"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#background)"/>
    <g transform="translate(${x} ${y}) scale(${scale})">
      ${iconImage(0, 0, 58)}
      <text x="74" y="39" fill="white" font-family="DejaVu Sans" font-size="28" font-weight="700">ADOverride</text>
      <g transform="translate(0 88)">
        <rect width="392" height="132" rx="12" fill="#ffffff" fill-opacity=".12"/>
        <g fill="#ffffff" fill-opacity=".18">
          <rect x="12" y="12" width="114" height="108" rx="7"/>
          <rect x="139" y="12" width="114" height="108" rx="7"/>
          <rect x="266" y="12" width="114" height="108" rx="7"/>
        </g>
        <g fill="white">
          <rect x="22" y="30" width="94" height="30" rx="5"/>
          <rect x="22" y="70" width="94" height="30" rx="5"/>
          <rect x="149" y="30" width="94" height="30" rx="5"/>
          <rect x="276" y="30" width="94" height="30" rx="5"/>
        </g>
        <g stroke="#0969da" stroke-width="4" stroke-linecap="round">
          <path d="M34 45h54M34 85h40M161 45h50M288 45h44"/>
        </g>
      </g>
    </g>
    ${marquee ? `<g transform="translate(855 100)">
      <rect width="420" height="360" rx="24" fill="#fff"/>
      <rect x="24" y="24" width="228" height="30" rx="8" fill="#ddf4ff"/>
      <g fill="#eaeef2"><rect x="24" y="86" width="214" height="250" rx="12"/>
        <rect x="254" y="86" width="142" height="250" rx="12"/></g>
      <g fill="#8c959f"><rect x="44" y="114" width="120" height="12" rx="6"/>
        <rect x="44" y="146" width="174" height="8" rx="4"/>
        <rect x="44" y="170" width="148" height="8" rx="4"/>
        <rect x="274" y="114" width="70" height="12" rx="6"/></g>
      <g fill="#0969da"><rect x="274" y="154" width="96" height="40" rx="20"/>
        <rect x="274" y="216" width="96" height="40" rx="20"/></g>
      <g fill="white"><circle cx="350" cy="174" r="14"/><circle cx="350" cy="236" r="14"/></g>
    </g>` : ''}
  </svg>`;
}

for (const [name, width, height, svg] of [
  ['icon-128.png', 128, 128, `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">${iconImage(16, 16, 96)}</svg>`],
  ['promo-440x280.png', 440, 280, artwork(440, 280)],
  ['marquee-1400x560.png', 1400, 560, artwork(1400, 560)],
]) {
  const image = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
  assert.equal(image.readUInt32BE(16), width);
  assert.equal(image.readUInt32BE(20), height);
  await writeFile(new URL(name, directory), image);
}

const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage();
  const hero = await boardHero();
  const jpeg = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  }, hero.toString('base64'));
  await writeFile(new URL('../docs/images/board-hero.png', import.meta.url), hero);
  await writeFile(new URL('01-board.jpg', directory), Buffer.from(jpeg, 'base64'));
  for (const name of ['01-board', '02-workspace', '03-ticket-fields', '04-ticket-layout', '05-board-fields']) {
    const data = await readFile(new URL(`${name}.jpg`, directory));
    assert.equal(data.readUInt16BE(0), 0xffd8, `${name} must be JPEG`);
    const size = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${base64}`;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, data.toString('base64'));
    assert.deepEqual(size, [1280, 800], `${name} must be 1280x800`);
  }
} finally {
  await browser.close();
}
console.log('Updated the Board hero; verified five 1280x800 JPEGs, 128px icon, 440x280 tile and 1400x560 marquee.');
