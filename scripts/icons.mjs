import { mkdir, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SlidersIcon } from '@primer/octicons-react';
import { Resvg } from '@resvg/resvg-js';

const glyph = renderToStaticMarkup(createElement(SlidersIcon, { size: 80, fill: '#ffffff' }));
for (const [directory, color] of [['icon', '#0969da'], ['icon-gray', '#6e6e6e']]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="${color}"/><g transform="translate(24 24)">${glyph}</g></svg>`;
  await mkdir(`public/${directory}`, { recursive: true });
  for (const size of [16, 32, 48, 96, 128]) {
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
    await writeFile(`public/${directory}/${size}.png`, image.render().asPng());
  }
}
