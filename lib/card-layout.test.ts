import { describe, expect, it } from 'vitest';
import { nativePreferences } from '../tests/preferences-fixture';
import { cardDropPosition, decodeCardLayouts, moveCard, resolveCardLayout, visualCardColumns, type CardLayout } from './card-layout';
import { applyPreferenceAction, decodePreferences, defaultPreferences } from './preferences';

const native: CardLayout = [
  ['group:details/description', 'group:details/discussion'],
  ['group:details/planning', 'group:details/review'],
  ['group:details/development'],
];

describe('manual Ticket card layouts', () => {
  it('validates page identities and rejects duplicate or non-card entries', () => {
    expect(decodeCardLayouts({ 'page:details': native })).toEqual({ 'page:details': native });
    expect(() => decodeCardLayouts({ 'field:system.title': native })).toThrow();
    expect(() => decodeCardLayouts({ 'page:details': [['group:details/planning'], ['group:details/planning'], []] })).toThrow();
    expect(() => decodeCardLayouts({ 'page:details': [['field:system.title'], [], []] })).toThrow();
    expect(() => decodeCardLayouts({ 'page:details': [[], []] })).toThrow();
  });

  it('preserves absent template cards and appends newly discovered cards', () => {
    const saved: CardLayout = [['group:details/absent'], ['group:details/description'], []];
    const resolved = resolveCardLayout(saved, native);
    expect(resolved[0]).toEqual(['group:details/absent', 'group:details/discussion']);
    expect(resolved[1]).toEqual(['group:details/description', 'group:details/planning', 'group:details/review']);
    expect(resolved[2]).toEqual(['group:details/development']);
    expect(saved).toEqual([['group:details/absent'], ['group:details/description'], []]);
  });

  it('moves a card across columns without changing other card order', () => {
    const moved = moveCard(native, 'group:details/planning', 2, null);
    expect(moved).toEqual([
      native[0], ['group:details/review'], ['group:details/development', 'group:details/planning'],
    ]);
    expect(native[1]).toEqual(['group:details/planning', 'group:details/review']);
    expect(() => moveCard(native, 'group:details/missing', 0, null)).toThrow();
  });

  it('uses the same before-after and column intent for preview and durable moves', () => {
    const key = 'group:details/planning';
    const target = 'group:details/development';
    const before = cardDropPosition(native, key, target, false);
    const after = cardDropPosition(native, key, target, true);
    expect(before).toEqual({ column: 2, before: target });
    expect(after).toEqual({ column: 2, before: null });
    expect(moveCard(native, key, before.column, before.before)[2]).toEqual([key, target]);
    expect(moveCard(native, key, after.column, after.before)[2]).toEqual([target, key]);
    expect(cardDropPosition(native, key, 'column:0', false)).toEqual({ column: 0, before: null });
    expect(() => cardDropPosition(native, key, 'group:details/missing', false)).toThrow();
  });

  it('packs visible columns and stacks narrow forms without losing stored placement', () => {
    const visible = new Set(['group:details/description', 'group:details/development']);
    const columns = visualCardColumns(native, visible, 1200);
    expect(columns.map(column => column.column)).toEqual([0, 2]);
    expect(columns[1]?.x).toBeCloseTo((1200 - 16) * 2 / 3 + 16);
    expect(visualCardColumns(native, visible, 600)).toEqual([{
      column: 0, keys: ['group:details/description', 'group:details/development'], x: 0, width: 600,
    }]);
  });

  it('retains native card proportions instead of replacing them with fixed column weights', () => {
    const sizes = new Map(native.flat().map(key => [key, {
      width: native[0].includes(key) ? 1040 : 280,
      minimumWidth: native[0].includes(key) ? 480 : 240,
    }]));
    const columns = visualCardColumns(native, new Set(native.flat()), 1600, sizes);
    expect(columns[0]?.width).toBeCloseTo((1600 - 32) * 0.65);
    expect(columns[1]?.width).toBeCloseTo((1600 - 32) * 0.175);
    expect(columns[2]?.width).toBeCloseTo((1600 - 32) * 0.175);
    expect(visualCardColumns(native, new Set(native.flat()), 940, sizes)).toEqual([{
      column: 0, keys: native.flat(), x: 0, width: 940,
    }]);
  });

  it('carries a wide editor footprint into its destination column and retains a usable minimum', () => {
    const sizes = new Map(native.flat().map(key => [key, {
      width: native[0].includes(key) ? 1040 : 280,
      minimumWidth: native[0].includes(key) ? 480 : 240,
    }]));
    const moved = moveCard(native, 'group:details/description', 2, null);
    const columns = visualCardColumns(moved, new Set(native.flat()), 1400, sizes);
    expect(columns[0]?.width).toBeGreaterThanOrEqual(480);
    expect(columns[1]?.width).toBeGreaterThanOrEqual(240);
    expect(columns[2]?.width).toBeGreaterThanOrEqual(480);
    expect(columns[0]?.width).toBeCloseTo(columns[2]?.width ?? 0);
    expect(visualCardColumns(moved, new Set(native.flat()), 1100, sizes)).toEqual([{
      column: 0, keys: moved.flat(), x: 0, width: 1100,
    }]);
  });

  it('migrates v3 without changing visibility or activating a manual layout', () => {
    const previous = {
      ...defaultPreferences(), version: 3,
      ticket: { presetId: 'ticket:default', hiddenTargets: ['group:details/planning'], savedPresets: [] },
    };
    const decoded = decodePreferences(previous);
    expect(decoded.version).toBe(11);
    expect(decoded.ticket.hiddenTargets).toEqual(['group:details/planning']);
    expect(decoded.ticket.cardLayouts).toEqual({});
    expect(decodePreferences(decoded)).toEqual(decoded);
  });

  it('saves arrangement snapshots only in the Ticket bank and resets positions independently', () => {
    let settings = nativePreferences();
    settings = applyPreferenceAction(settings, { kind: 'ticket-target', key: 'group:details/review', hidden: true });
    settings = applyPreferenceAction(settings, {
      kind: 'ticket-card-move', page: 'page:details', key: 'group:details/planning',
      column: 2, before: null, native,
    });
    const layout = settings.ticket.cardLayouts['page:details'];
    settings = applyPreferenceAction(settings, { kind: 'save-preset', area: 'ticket', id: 'arranged', name: 'Arranged' });
    expect(settings.ticket.savedPresets[0]?.ticket?.cardLayouts['page:details']).toEqual(layout);
    expect(settings.savedPresets).toEqual([]);
    settings = applyPreferenceAction(settings, { kind: 'reset-ticket' });
    expect(settings.ticket.hiddenTargets).toEqual([]);
    expect(settings.ticket.cardLayouts['page:details']).toEqual(layout);
    settings = applyPreferenceAction(settings, { kind: 'reset-ticket-layout' });
    expect(settings.ticket.cardLayouts).toEqual({});
    settings = applyPreferenceAction(settings, { kind: 'apply-preset', area: 'ticket', presetId: 'arranged' });
    expect(settings.ticket.cardLayouts['page:details']).toEqual(layout);
    expect(settings.ticket.hiddenTargets).toEqual(['group:details/review']);
  });
});
