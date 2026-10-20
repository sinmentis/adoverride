import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const active = await readFile(new URL('../assets/brand.svg', import.meta.url), 'utf8');
const inactive = active.replaceAll('#2864e8', '#9098a7').replaceAll('#ffb06b', '#b5bcc8');
for (const [directory, svg] of [['icon', active], ['icon-gray', inactive]]) {
  await mkdir(`public/${directory}`, { recursive: true });
  for (const size of [16, 32, 48, 96, 128]) {
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
    await writeFile(`public/${directory}/${size}.png`, image.render().asPng());
  }
}
