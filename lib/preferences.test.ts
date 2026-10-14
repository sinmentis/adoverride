import { describe, expect, it } from 'vitest';
import { applyPreferenceAction, commitPreferenceAction, createPreferencesStore, decodePreferences, decodeTicketProfile,
  defaultPreferences, defaultTicketProfile, defaultView, TICKET_BUILTIN_PRESETS, type Preferences } from './preferences';
import { exportConfiguration, parseConfiguration } from './configuration';
import { nativePreferences } from '../tests/preferences-fixture';

describe('preferences', () => {
  it('uses the built-in kiwifruit Ticket profile only as the fresh-install default', () => {
    const preset = TICKET_BUILTIN_PRESETS.find(preset => preset.id === 'ticket:kiwifruit');
    expect(preset?.name).toBe('kiwifruit');
    expect(preset?.ticket).toBeDefined();
    const current = defaultPreferences();
    expect(current.ticket).toEqual({ presetId: 'ticket:kiwifruit', ...preset?.ticket,
      savedPresets: [], layoutLocked: false, undo: null });
    expect(current.ticket.viewMode).toBe('workspace');
    expect(current.ticket.hiddenTargets).toHaveLength(24);
    expect(current.ticket.cardLayouts['page:details']?.map(column => column.length)).toEqual([6, 7, 3]);
    expect(current.ticket.workspaceLayouts).toEqual({});
    expect(current.views).toEqual({ all: defaultView() });
    expect(decodePreferences(current)).toEqual(current);
  });

  it('clones built-in Ticket profiles instead of mutating defaults through a preferences instance', () => {
    const original = defaultPreferences();
    const changed = defaultPreferences();
    changed.ticket.hiddenTargets.push('group:details/private');
    changed.ticket.cardLayouts['page:details']?.[0].push('group:details/private');
    expect(defaultPreferences()).toEqual(original);
    expect(TICKET_BUILTIN_PRESETS.find(preset => preset.id === 'ticket:kiwifruit')?.ticket).toEqual(decodeTicketProfile(original.ticket));
  });

  it('applies kiwifruit as an undoable portable preset while retaining lock and Library settings', () => {
    const original = nativePreferences();
    original.theme = 'dark';
    original.ticket.layoutLocked = true;
    original.ticket.hiddenTargets = ['group:details/description'];
    const applied = commitPreferenceAction(original, { kind: 'apply-preset', area: 'ticket', presetId: 'ticket:kiwifruit' }, 'kiwifruit-1');
    expect(decodeTicketProfile(applied.ticket)).toEqual(decodeTicketProfile(defaultPreferences().ticket));
    expect(applied.ticket.layoutLocked).toBe(true);
    expect(applied.theme).toBe(original.theme);
    expect(applied.views).toEqual(original.views);
    expect(parseConfiguration(JSON.stringify(exportConfiguration(applied))).preferences.ticket)
      .toEqual({ ...applied.ticket, undo: null });
    expect(applyPreferenceAction(applied, { kind: 'undo-ticket', id: 'kiwifruit-1' })).toEqual(original);
    let native = applyPreferenceAction(applied, { kind: 'ticket-view', viewMode: 'native' });
    native = applyPreferenceAction(native, { kind: 'reset-ticket' });
    native = applyPreferenceAction(native, { kind: 'reset-ticket-layout' });
    expect(decodeTicketProfile(native.ticket)).toEqual(defaultTicketProfile());
    expect(native.ticket.layoutLocked).toBe(true);
  });

  it('retains existing native preferences instead of adopting a new built-in during load or initialization', async () => {
    let stored = nativePreferences();
    stored.ticket.hiddenTargets = ['group:details/planning'];
    const original = structuredClone(stored);
    const store = createPreferencesStore({ read: async () => stored, write: async value => { stored = value; } });
    expect(await store.load()).toEqual(original);
    await store.update(current => applyPreferenceAction(current, { kind: 'initialize' }));
    expect(stored).toEqual({ ...original, revision: original.revision + 1 });
    await store.reset();
    expect(stored).toEqual({ ...defaultPreferences(), revision: original.revision + 2 });
  });

  it('protects kiwifruit in both banks and removes old saved templates during upgrade', () => {
    const current = defaultPreferences();
    expect(() => applyPreferenceAction(current, { kind: 'save-preset', area: 'ticket',
      id: 'ticket:kiwifruit', name: 'Changed' })).toThrow('Built-in presets cannot be overwritten');
    expect(() => applyPreferenceAction(current, { kind: 'save-preset', area: 'ticket',
      id: 'saved-kiwifruit', name: 'kiwifruit' })).toThrow('name already exists');
    current.ticket.savedPresets = [{ id: 'existing-user-preset', name: 'kiwifruit', ticket: defaultTicketProfile() }];
    expect(decodePreferences({ ...current, version: 10 }).ticket.savedPresets).toEqual([]);
    expect(() => applyPreferenceAction(current, { kind: 'save-preset', area: 'library',
      id: 'library-kiwifruit', name: 'kiwifruit', viewKey: 'all' })).toThrow('name already exists');
  });

  it('round-trips scopes and named presets', () => {
    const data = defaultPreferences();
    data.savedPresets.push({
      id: 'saved-one',
      name: 'Daily focus',
      appearance: { density: 'compact', features: { ...defaultView().appearance.features, showLabels: false } },
      board: { ...defaultView().board, equalColumns: true },
    });
    data.views['board:["example","platform/_boards/team"]'] = {
      presetId: 'saved-one',
      appearance: { density: 'compact', features: { ...defaultView().appearance.features, showLabels: false } },
      board: { ...defaultView().board, equalColumns: true },
    };
    expect(decodePreferences(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('rejects corrupt settings rather than silently resetting them', () => {
    expect(() => decodePreferences(null)).toThrow('version');
    expect(() => decodePreferences({ ...defaultPreferences(), version: 12 })).toThrow('version');
    const view = defaultView();
    const invalid = {
      ...defaultPreferences(),
      views: { all: { ...view, appearance: { ...view.appearance, features: { ...view.appearance.features, showLabels: 'yes' } } } },
    };
    expect(() => decodePreferences(invalid)).toThrow('showLabels');
    expect(() => decodePreferences({ ...defaultPreferences(), scope: ['all'] })).toThrow('Invalid stored');
  });

  it('serializes rapid updates without losing earlier changes', async () => {
    let data: Preferences | undefined;
    const store = createPreferencesStore({
      read: async () => data,
      write: async value => { data = value; },
    });
    await Promise.all([
      store.update(current => ({ ...current, theme: 'dark' })),
      store.update(current => ({ ...current, enabled: false })),
    ]);
    expect(data).toMatchObject({ theme: 'dark', enabled: false });
  });

  it('surfaces failed writes and allows a later retry', async () => {
    let data: Preferences | undefined;
    let fail = true;
    const store = createPreferencesStore({
      read: async () => data,
      write: async value => {
        if (fail) throw new Error('Storage failed');
        data = value;
      },
    });
    await expect(store.update(current => ({ ...current, theme: 'dark' }))).rejects.toThrow('Storage failed');
    expect(data).toBeUndefined();
    fail = false;
    await store.update(current => ({ ...current, theme: 'dark' }));
    expect(data?.theme).toBe('dark');
  });
});
