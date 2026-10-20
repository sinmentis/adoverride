// @vitest-environment node
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';

const active = readFileSync(new URL('../assets/brand.svg', import.meta.url), 'utf8');
const inactive = active.replaceAll('#2864e8', '#9098a7').replaceAll('#ffb06b', '#b5bcc8');

describe('Offset brand icons', () => {
  it.each([16, 32, 48, 96, 128])('generates matching active and inactive %dpx icons', size => {
    for (const [directory, svg] of [['icon', active], ['icon-gray', inactive]]) {
      const png = readFileSync(new URL(`../public/${directory}/${size}.png`, import.meta.url));
      const expected = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      expect(png.equals(expected)).toBe(true);
    }
  });
  it('keeps the center and gap transparent', () => {
    const { pixels } = new Resvg(active).render();
    const alpha = (x, y) => pixels[(y * 128 + x) * 4 + 3];
    expect(alpha(64, 64)).toBe(0);
    expect(alpha(104, 44)).toBe(0);
    expect(alpha(104, 20)).toBe(255);
    expect(alpha(20, 64)).toBe(255);
  });
});
