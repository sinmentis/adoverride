import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const source = new URL('../docs/images/social-preview.svg', import.meta.url);
const output = new URL('../docs/images/social-preview.png', import.meta.url);
const brand = (await readFile(new URL('../assets/brand.svg', import.meta.url))).toString('base64');
const svg = (await readFile(source, 'utf8')).replaceAll('../../assets/brand.svg', `data:image/svg+xml;base64,${brand}`);
const image = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } });
await writeFile(output, image.render().asPng());
