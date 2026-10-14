import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const source = new URL('../docs/images/social-preview.svg', import.meta.url);
const output = new URL('../docs/images/social-preview.png', import.meta.url);
const image = new Resvg(await readFile(source), { font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } });
await writeFile(output, image.render().asPng());
