import { describe, expect, it } from 'vitest';
import { applyPreferenceAction, commitPreferenceAction, createPreferencesStore, decodePreferenceAction,
  decodePreferences, defaultPreferences } from './preferences';
import type { CardLayout } from './card-layout';
import { nativePreferences } from '../tests/preferences-fixture';

const native: CardLayout = [['group:details/description'], ['group:details/planning'], ['group:details/development']];
const move = { kind: 'ticket-card-move', page: 'page:details', key: 'group:details/planning', column: 2, before: null, native } as const;

describe('durable Ticket Undo and layout lock', () => {
  it('migrates v4 presentation and presets without enabling a lock or inventing Undo', () => {
    const original = nativePreferences();
    const { layoutLocked: _lock, undo: _undo, ...ticket } = original.ticket;
    ticket.hiddenTargets = ['group:details/planning'];
    ticket.cardLayouts = { 'page:details': native };
    ticket.presetId = 'daily';
    ticket.savedPresets = [{ id: 'daily', name: 'Daily', ticket: { hiddenTargets: ticket.hiddenTargets, cardLayouts: ticket.cardLayouts,
      viewMode: 'native', workspaceLayouts: {} } }];
    const migrated = decodePreferences({ ...original, version: 4, ticket });
    expect(migrated.version).toBe(11);
    expect(migrated.ticket).toMatchObject({ ...ticket, presetId: 'ticket:kiwifruit', savedPresets: [], layoutLocked: false, undo: null });
    expect(decodePreferences(migrated)).toEqual(migrated);
  });

  it('undoes a saved move while preserving newer lock, theme, Library and saved-preset settings', () => {
    const original = nativePreferences();
    let settings = commitPreferenceAction(original, move, 'move-1');
    settings = applyPreferenceAction(settings, { kind: 'ticket-layout-lock', locked: true });
    settings = applyPreferenceAction(settings, { kind: 'patch', theme: 'dark' });
    settings = applyPreferenceAction(settings, { kind: 'save-preset', area: 'ticket', id: 'arranged', name: 'Arranged' });
    const restored = commitPreferenceAction(settings, { kind: 'undo-ticket', id: 'move-1' }, 'undo-1');
    expect(restored.ticket.cardLayouts).toEqual({});
    expect(restored.ticket.layoutLocked).toBe(true);
    expect(restored.theme).toBe('dark');
    expect(restored.views).toEqual(settings.views);
    expect(restored.ticket.savedPresets).toEqual(settings.ticket.savedPresets);
    expect(restored.ticket.undo).toBeNull();
  });

  it('restores visibility without clearing the previous layout and rejects stale Undo', () => {
    let settings = commitPreferenceAction(nativePreferences(), move, 'move-1');
    const positions = settings.ticket.cardLayouts;
    settings = commitPreferenceAction(settings, { kind: 'ticket-target', key: 'group:details/planning', hidden: true }, 'hide-1');
    expect(() => applyPreferenceAction(settings, { kind: 'undo-ticket', id: 'move-1' })).toThrow('newer customization');
    const restored = applyPreferenceAction(settings, { kind: 'undo-ticket', id: 'hide-1' });
    expect(restored.ticket.hiddenTargets).toEqual([]);
    expect(restored.ticket.cardLayouts).toEqual(positions);
    expect(restored.ticket.undo).toBeNull();
  });

  it('keeps lock independent of preset snapshots and enforces it for stale move requests', () => {
    let settings = applyPreferenceAction(nativePreferences(), { kind: 'ticket-layout-lock', locked: true });
    expect(() => commitPreferenceAction(settings, move, 'stale-move')).toThrow('Layout is locked');
    settings = applyPreferenceAction(settings, { kind: 'save-preset', area: 'ticket', id: 'locked', name: 'Locked view' });
    expect(settings.ticket.savedPresets[0]?.ticket).not.toHaveProperty('layoutLocked');
    expect(settings.ticket.savedPresets[0]?.ticket).not.toHaveProperty('undo');
    settings = applyPreferenceAction(settings, { kind: 'apply-preset', area: 'ticket', presetId: 'ticket:kiwifruit' });
    expect(settings.ticket.layoutLocked).toBe(true);
    expect(() => decodePreferenceAction({ kind: 'ticket-layout-lock', locked: 'yes' })).toThrow();
  });

  it('does not record a new Undo entry on a no-op or a failed write', async () => {
    const original = nativePreferences();
    expect(commitPreferenceAction(original, { kind: 'ticket-target', key: 'group:details/planning', hidden: false }, 'noop').ticket.undo).toBeNull();
    let stored = original;
    let fail = true;
    const store = createPreferencesStore({ read: async () => stored, write: async value => {
      if (fail) throw new Error('Storage failed');
      stored = value;
    } });
    await expect(store.update(current => commitPreferenceAction(current, move, 'failed'))).rejects.toThrow('Storage failed');
    expect(stored).toEqual(original);
    fail = false;
    await store.update(current => commitPreferenceAction(current, move, 'saved'));
    expect(stored.ticket.undo?.id).toBe('saved');
    expect(stored.revision).toBe(1);
  });

  it('retains acknowledged history through decoding and serializes competing customization changes', async () => {
    let stored = nativePreferences();
    const store = createPreferencesStore({ read: async () => stored, write: async value => { stored = value; } });
    await Promise.all([
      store.update(current => commitPreferenceAction(current, move, 'move-1')),
      store.update(current => commitPreferenceAction(current, { kind: 'ticket-target', key: 'group:details/planning', hidden: true }, 'hide-1')),
    ]);
    const reopened = decodePreferences(JSON.parse(JSON.stringify(stored)));
    expect(reopened.revision).toBe(2);
    expect(reopened.ticket.undo?.id).toBe('hide-1');
    expect(() => applyPreferenceAction(reopened, { kind: 'undo-ticket', id: 'move-1' })).toThrow();
    expect(applyPreferenceAction(reopened, { kind: 'undo-ticket', id: 'hide-1' }).ticket.cardLayouts).toEqual(stored.ticket.cardLayouts);
  });

  it('undoes presentation resets and preset application without creating a Redo history', () => {
    const arranged = commitPreferenceAction(nativePreferences(), move, 'move-1');
    const reset = commitPreferenceAction(arranged, { kind: 'reset-ticket-layout' }, 'reset-1');
    expect(applyPreferenceAction(reset, { kind: 'undo-ticket', id: 'reset-1' }).ticket.cardLayouts).toEqual(arranged.ticket.cardLayouts);
    const hidden = commitPreferenceAction(arranged, { kind: 'ticket-target', key: 'group:details/planning', hidden: true }, 'hide-1');
    const shown = commitPreferenceAction(hidden, { kind: 'reset-ticket' }, 'show-1');
    expect(applyPreferenceAction(shown, { kind: 'undo-ticket', id: 'show-1' }).ticket.hiddenTargets).toEqual(hidden.ticket.hiddenTargets);
    const applied = commitPreferenceAction(hidden, { kind: 'apply-preset', area: 'ticket', presetId: 'ticket:kiwifruit' }, 'preset-1');
    const undone = applyPreferenceAction(applied, { kind: 'undo-ticket', id: 'preset-1' });
    expect(undone.ticket.cardLayouts).toEqual(hidden.ticket.cardLayouts);
    expect(undone.ticket.hiddenTargets).toEqual(hidden.ticket.hiddenTargets);
    expect(() => applyPreferenceAction(undone, { kind: 'undo-ticket', id: 'preset-1' })).toThrow();
  });

  it('rejects corrupt history and keeps revisions increasing across explicit reset', async () => {
    const settings = commitPreferenceAction(nativePreferences(), move, 'move-1');
    expect(() => decodePreferences({ ...settings, ticket: { ...settings.ticket, undo: { ...settings.ticket.undo, id: '' } } })).toThrow('undo ID');
    expect(() => decodePreferences({ ...settings, ticket: { ...settings.ticket, undo: { ...settings.ticket.undo, kind: 'unknown' } } })).toThrow('undo');
    expect(() => decodePreferences({ ...settings, revision: -1 })).toThrow('revision');
    let stored = { ...settings, revision: 12 };
    const store = createPreferencesStore({ read: async () => stored, write: async value => { stored = value; } });
    await store.reset();
    expect(stored).toEqual({ ...defaultPreferences(), revision: 13 });
  });
});
