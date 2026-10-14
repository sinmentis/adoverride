import { isObject, isTargetKey } from './ticket';

export const CARD_COLUMNS = [0, 1, 2] as const;
export type CardColumn = (typeof CARD_COLUMNS)[number];
export type CardLayout = [string[], string[], string[]];
export type CardLayouts = Record<string, CardLayout>;
export const CARD_GAP = 16;
export const WORKSPACE_GAP = 4;
export const WORKSPACE_HEADING_HEIGHT = 24;
export const emptyCardLayout = (): CardLayout => [[], [], []];
export const isCardKey = (value: unknown): value is string =>
  isTargetKey(value) && value.startsWith('group:') && value.length <= 512;
export const isPageKey = (value: unknown): value is string =>
  isTargetKey(value) && value.startsWith('page:') && value.length <= 512;
export const isCardColumn = (value: unknown): value is CardColumn => value === 0 || value === 1 || value === 2;

export function decodeCardLayout(value: unknown): CardLayout {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Invalid card columns.');
  const parse = (column: unknown): string[] => {
    if (!Array.isArray(column) || !column.every(isCardKey)) throw new Error('Invalid card columns.');
    return [...column];
  };
  const columns: CardLayout = [parse(value[0]), parse(value[1]), parse(value[2])];
  const keys = columns.flat();
  if (keys.length > 300 || new Set(keys).size !== keys.length) throw new Error('Invalid or duplicate card positions.');
  return columns;
}

export function decodeCardLayouts(value: unknown): CardLayouts {
  if (!isObject(value) || Object.keys(value).length > 64) throw new Error('Invalid saved card layouts.');
  const layouts: CardLayouts = {};
  for (const page of Object.keys(value).sort()) {
    if (!isPageKey(page)) throw new Error('Invalid card layout page.');
    layouts[page] = decodeCardLayout(value[page]);
  }

  return layouts;
}

export function decodeWorkspaceLayouts(value: unknown): CardLayouts {
  const layouts = decodeCardLayouts(value);
  if (Object.values(layouts).some(layout => layout[2].length)) throw new Error('Workspace supports two card lanes.');
  return layouts;
}

export function resolveCardLayout(previous: CardLayout | undefined, native: CardLayout): CardLayout {
  const result = previous ? decodeCardLayout(previous) : emptyCardLayout();
  const known = new Set(result.flat());
  for (const column of CARD_COLUMNS) for (const key of native[column]) {
    if (!known.has(key)) { result[column].push(key); known.add(key); }
  }
  return result;
}

export function moveCard(layout: CardLayout, key: string, column: CardColumn, before: string | null): CardLayout {
  if (!layout.flat().includes(key)) throw new Error('The card is no longer available.');
  if (before === key) return decodeCardLayout(layout);
  const result = decodeCardLayout(layout);
  for (const slot of CARD_COLUMNS) result[slot] = result[slot].filter(candidate => candidate !== key);
  if (before !== null && !result[column].includes(before)) throw new Error('The drop target is no longer in this column.');
  const index = before === null ? result[column].length : result[column].indexOf(before);
  result[column].splice(index, 0, key);
  return result;
}

export function cardDropPosition(layout: CardLayout, key: string, target: string, after: boolean): { column: CardColumn; before: string | null } {
  if (!layout.flat().includes(key)) throw new Error('The card is no longer available.');
  const lane = CARD_COLUMNS.find(column => target === `column:${column}`);
  if (lane !== undefined) return { column: lane, before: null };
  const column = CARD_COLUMNS.find(slot => layout[slot].includes(target));
  if (column === undefined) throw new Error('The drop target is no longer available.');
  if (target === key) return { column, before: key };
  const keys = layout[column].filter(candidate => candidate !== key);
  return { column, before: after ? keys[keys.indexOf(target) + 1] ?? null : target };
}

export interface VisualCardColumn {
  column: CardColumn;
  keys: string[];
  x: number;
  width: number;
}
export interface CardSizing {
  width: number;
  minimumWidth: number;
}
export function visualCardColumns(layout: CardLayout, visible: ReadonlySet<string>, width: number,
  sizes?: ReadonlyMap<string, CardSizing>): VisualCardColumn[] {
  if (!Number.isFinite(width) || width <= 0) throw new Error('The card grid has no usable width.');
  const active = CARD_COLUMNS.filter(column => layout[column].some(key => visible.has(key)));
  if (!active.length) return [];
  const gap = CARD_GAP;
  const available = width - gap * (active.length - 1);
  const tracks = active.map(column => {
    const keys = layout[column].filter(key => visible.has(key));
    const measurements = keys.map(key => {
      if (!sizes) return { width: column === 0 ? 2 : 1, minimumWidth: column === 0 ? 480 : 240 };
      const size = sizes.get(key);
      if (!size || !Number.isFinite(size.width) || size.width <= 0 ||
        !Number.isFinite(size.minimumWidth) || size.minimumWidth <= 0) throw new Error('A native card has no usable measurements.');
      return size;
    });
    return { column, keys, preferred: Math.max(...measurements.map(size => size.width)),
      minimum: Math.max(...measurements.map(size => size.minimumWidth)) };
  });
  if (width < 850 || tracks.reduce((sum, track) => sum + track.minimum, 0) > available) {
    return [{ column: 0, keys: layout.flat().filter(key => visible.has(key)), x: 0, width }];
  }

  const widths = new Map<CardColumn, number>();
  let remaining = tracks;
  let free = available;
  while (remaining.length) {
    const weight = remaining.reduce((sum, track) => sum + track.preferred, 0);
    const constrained = remaining.filter(track => free * track.preferred / weight < track.minimum);
    if (!constrained.length) {
      for (const track of remaining) widths.set(track.column, free * track.preferred / weight);
      break;
    }
    for (const track of constrained) { widths.set(track.column, track.minimum); free -= track.minimum; }
    remaining = remaining.filter(track => !constrained.includes(track));
  }
  let x = 0;
  return tracks.map(track => {
    const size = widths.get(track.column);
    if (size === undefined) throw new Error('A card column could not be sized.');
    const result = { column: track.column, keys: track.keys, x, width: size };
    x += size + gap;
    return result;
  });
}

export function visualWorkspaceColumns(layout: CardLayout, visible: ReadonlySet<string>, width: number,
  sizes: ReadonlyMap<string, CardSizing>, properties = false): VisualCardColumn[] {
  if (!Number.isFinite(width) || width <= 0 || layout[2].length) throw new Error('Workspace has no usable two-lane grid.');
  const main = layout[0].filter(key => visible.has(key));
  const rail = layout[1].filter(key => visible.has(key));
  if (!main.length) return rail.length || properties ? [{ column: 1, keys: rail, x: 0, width }] : [];
  if (!rail.length && !properties) return [{ column: 0, keys: main, x: 0, width }];
  function minimum(keys: string[], floor: number) {
    for (const key of keys) {
      const size = sizes.get(key);
      if (!size || !Number.isFinite(size.minimumWidth) || size.minimumWidth <= 0) throw new Error('Workspace card measurements are unavailable.');
      floor = Math.max(floor, size.minimumWidth);
    }
    return floor;
  }
  const mainMinimum = minimum(main, 480);
  const railMinimum = minimum(rail, 320);
  if (width < 850 || mainMinimum + railMinimum + CARD_GAP > width) {
    return [{ column: 0, keys: [...main, ...rail], x: 0, width }];
  }
  const railWidth = Math.min(width - CARD_GAP - mainMinimum, Math.max(railMinimum, Math.min(440, width * 0.28)));
  const mainWidth = width - CARD_GAP - railWidth;
  return [{ column: 0, keys: main, x: 0, width: mainWidth }, { column: 1, keys: rail, x: mainWidth + CARD_GAP, width: railWidth }];
}
