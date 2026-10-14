import { describe, expect, it } from 'vitest';
import { exportConfiguration, parseConfiguration } from './configuration';
import { applyPreferenceAction, BUILTIN_PRESETS, createPreferencesStore, decodePreferences, decodeTicketProfile,
  defaultBoardProfile, defaultPreferences, defaultTicketProfile, defaultView, TICKET_BUILTIN_PRESETS } from './preferences';

const kiwifruitBoard = {
  ...defaultBoardProfile(), equalColumns: true, compactHeader: true, compactCards: false, autoLoadItems: true,
};

function previousPreferences() {
  const board = { ...defaultBoardProfile(), compactCards: true, cardFields: { ...defaultBoardProfile().cardFields, tags: false } };
  const ticket = { ...defaultTicketProfile(), hiddenTargets: ['group:details/planning'] };
  return {
    ...defaultPreferences(), version: 10, revision: 20, enabled: false, theme: 'dark', scope: 'project',
    savedPresets: [{ id: 'old-board', name: 'Old Board', board }],
    views: {
      all: { ...defaultView(), presetId: 'board:original', board: defaultBoardProfile() },
      'project:["example","platform"]': { ...defaultView(), presetId: 'old-board', board },
    },
    ticket: {
      ...defaultPreferences().ticket, ...ticket, presetId: 'old-ticket', layoutLocked: true,
      savedPresets: [{ id: 'old-ticket', name: 'Old Ticket', ticket }],
      undo: { id: 'previous-change', kind: 'visibility', previous: { ...defaultTicketProfile(), presetId: 'ticket:default' } },
    },
  };
}

describe('kiwifruit release defaults and template cleanup', () => {
  it('has exactly one kiwifruit built-in per area and the requested fresh Board setup', () => {
    expect(BUILTIN_PRESETS.map(({ id, name }) => ({ id, name }))).toEqual([{ id: 'board:kiwifruit', name: 'kiwifruit' }]);
    expect(TICKET_BUILTIN_PRESETS.map(({ id, name }) => ({ id, name }))).toEqual([{ id: 'ticket:kiwifruit', name: 'kiwifruit' }]);
    const current = defaultPreferences();
    expect(current.version).toBe(11);
    expect(current.views.all).toMatchObject({ presetId: 'board:kiwifruit', board: kiwifruitBoard });
    expect(current.ticket.viewMode).toBe('workspace');
    expect(current.ticket.hiddenTargets).toHaveLength(24);
    expect(current.savedPresets).toEqual([]);
    expect(current.ticket.savedPresets).toEqual([]);
  });

  it('clones the Board preset when creating and applying preferences', () => {
    const original = defaultPreferences();
    const changed = defaultPreferences();
    if (!changed.views.all?.board) throw new Error('Missing factory Board profile.');
    changed.views.all.board.cardFields.tags = false;
    expect(defaultPreferences()).toEqual(original);
    expect(BUILTIN_PRESETS[0]?.board).toEqual(kiwifruitBoard);
    const applied = applyPreferenceAction(changed, { kind: 'apply-preset', area: 'library',
      presetId: 'board:kiwifruit', viewKey: 'all' });
    expect(applied.views.all?.board).toEqual(kiwifruitBoard);
    expect(applied.ticket).toEqual(changed.ticket);
  });

  it('removes old saved templates and references without changing active settings or Undo content', () => {
    const previous = previousPreferences();
    const current = decodePreferences(previous);
    expect(current.version).toBe(11);
    expect(current.savedPresets).toEqual([]);
    expect(current.ticket.savedPresets).toEqual([]);
    expect(current.views.all).toEqual({ ...previous.views.all, presetId: 'board:kiwifruit' });
    expect(current.views['project:["example","platform"]']).toEqual({
      ...previous.views['project:["example","platform"]'], presetId: 'board:kiwifruit',
    });
    expect(decodeTicketProfile(current.ticket)).toEqual(decodeTicketProfile(previous.ticket));
    expect(current.ticket.layoutLocked).toBe(true);
    expect(current.ticket.presetId).toBe('ticket:kiwifruit');
    expect(current.ticket.undo).toEqual({
      id: 'previous-change', kind: 'visibility', previous: { ...defaultTicketProfile(), presetId: 'ticket:kiwifruit' },
    });
    expect(current).toMatchObject({ enabled: false, theme: 'dark', scope: 'project', revision: 20 });
    expect(decodePreferences(current)).toEqual(current);
  });

  it('cleans legacy imports and backup normalization while retaining active snapshots', () => {
    const imported = parseConfiguration(JSON.stringify({
      kind: 'ado-customize-configuration', version: 1, preferences: previousPreferences(),
    })).preferences;
    expect(imported.savedPresets).toEqual([]);
    expect(imported.ticket.savedPresets).toEqual([]);
    const portable = exportConfiguration(imported);
    expect(JSON.stringify(portable)).not.toMatch(/old-board|old-ticket|board:original|ticket:default/);
    expect(parseConfiguration(JSON.stringify(portable)).preferences).toEqual(imported);
  });

  it('rejects retired built-ins in current documents and actions', () => {
    const current = defaultPreferences();
    expect(() => decodePreferences({ ...current, views: { all: { ...defaultView(), presetId: 'board:original' } } }))
      .toThrow('unavailable Library preset');
    expect(() => applyPreferenceAction(current, { kind: 'apply-preset', area: 'ticket', presetId: 'ticket:default' }))
      .toThrow('no longer available');
    expect(() => applyPreferenceAction(current, { kind: 'apply-preset', area: 'library',
      presetId: 'board:equal', viewKey: 'all' })).toThrow('no longer available');
  });

  it('keeps Show all independent of preset availability and allows new personal presets', () => {
    let current = applyPreferenceAction(defaultPreferences(), { kind: 'reset-ticket' });
    expect(current.ticket.hiddenTargets).toEqual([]);
    expect(current.ticket.presetId).toBe('ticket:kiwifruit');
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'ticket', id: 'new-ticket', name: 'My view' });
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'library',
      id: 'new-board', name: 'My view', viewKey: 'all' });
    expect(decodePreferences(current)).toEqual(current);
    expect(current.savedPresets).toHaveLength(1);
    expect(current.ticket.savedPresets).toHaveLength(1);
  });

  it('persists cleanup once and resets both areas to kiwifruit', async () => {
    let stored: unknown = previousPreferences();
    const store = createPreferencesStore({ read: async () => stored, write: async value => { stored = value; } });
    const initial = await store.update(current => current);
    expect(initial.savedPresets).toEqual([]);
    const saved = await store.update(current => applyPreferenceAction(current, {
      kind: 'save-preset', area: 'library', id: 'after-upgrade', name: 'After upgrade', viewKey: 'all',
    }));
    expect((await store.load()).savedPresets).toEqual(saved.savedPresets);
    const reset = await store.reset();
    expect(reset.views.all?.board).toEqual(kiwifruitBoard);
    expect(reset.ticket.presetId).toBe('ticket:kiwifruit');
    expect(reset.savedPresets).toEqual([]);
  });
});
