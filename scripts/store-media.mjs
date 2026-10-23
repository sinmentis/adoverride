import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { chromium } from '@playwright/test';

const directory = new URL('../docs/store/', import.meta.url);
await mkdir(directory, { recursive: true });
const icon = (await readFile(new URL('../public/icon/96.png', import.meta.url))).toString('base64');
const iconImage = (x, y, size) =>
  `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/png;base64,${icon}"/>`;

const listingIcon = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">${iconImage(16, 16, 96)}</svg>`).render();
assert.equal(listingIcon.width, 128);
assert.equal(listingIcon.height, 128);
await writeFile(new URL('icon-128.png', directory), listingIcon.asPng());

const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage();
  // Curated promo artwork is an input, not a placeholder to regenerate.
  for (const [name, width, height] of [['promo-440x280.png', 440, 280], ['marquee-1400x560.png', 1400, 560]]) {
    const data = await readFile(new URL(name, directory));
    const size = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, data.toString('base64'));
    assert.deepEqual(size, [width, height], `${name} has unexpected dimensions`);
  }
  for (const [index, source] of ['pr-files-wide', 'pr-files-bottom', 'pr-commits', 'pr-reading-space', 'work-item-layout'].entries()) {
    const png = await readFile(new URL(`../docs/images/${source}.png`, import.meta.url));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 800], `${source} must be 1280x800`);
    const name = `${String(index + 1).padStart(2, '0')}-${source}`;
    const jpeg = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    }, png.toString('base64'));
    await writeFile(new URL(`${name}.jpg`, directory), Buffer.from(jpeg, 'base64'));
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
console.log('Converted five real-layout posters to 1280x800 JPEGs; verified the 128px icon, 440x280 tile and 1400x560 marquee.');
