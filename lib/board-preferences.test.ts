import { describe, expect, it } from 'vitest';
import { applyPreferenceAction, decodePreferenceAction, decodePreferences, defaultBoardProfile, defaultView,
  effectiveBoardView } from './preferences';
import { parseAdoContext, scopeKey } from './context';
import { exportConfiguration, parseConfiguration } from './configuration';
import { nativePreferences as defaultPreferences } from '../tests/preferences-fixture';

const context = parseAdoContext('https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories');
describe('real Board preferences', () => {
  it('removes retired column memory from v9 scopes, presets and portable configuration without changing retained settings', () => {
    const current = defaultPreferences();
    const board = { ...defaultBoardProfile(), equalColumns: true, autoLoadItems: true, compactCards: true, compactHeader: true,
      cardFields: { ...defaultBoardProfile().cardFields, assignee: false }, rememberColumns: true, columnStates: { 'column:closed': true } };
    const previous = { ...current, version: 9, views: { all: { ...defaultView(), board } },
      savedPresets: [{ id: 'saved-board', name: 'Saved Board', board }] };
    const migrated = decodePreferences(previous);
    for (const profile of [migrated.views.all?.board]) {
      expect(profile).not.toHaveProperty('rememberColumns');
      expect(profile).not.toHaveProperty('columnStates');
      expect(profile).toMatchObject({ equalColumns: true, autoLoadItems: true, compactCards: true, compactHeader: true,
        cardFields: { ...defaultBoardProfile().cardFields, assignee: false } });
    }
    expect(migrated.ticket).toEqual(current.ticket);
    expect(migrated.savedPresets).toEqual([]);
    const portable = JSON.stringify(exportConfiguration(migrated));
    expect(portable).not.toContain('rememberColumns');
    expect(portable).not.toContain('columnStates');
    const imported = parseConfiguration(JSON.stringify({ kind: 'ado-customize-configuration', version: 1, preferences: previous }));
    expect(imported.preferences.views).toEqual(migrated.views);
    expect(imported.preferences.savedPresets).toEqual(migrated.savedPresets);
  });
  it('migrates v7 width settings without enabling the new auto-load option', () => {
    const current = defaultPreferences();
    const previous = { ...current, version: 7,
      views: { all: { ...defaultView(), board: { equalColumns: true } } },
      savedPresets: [{ id: 'wide', name: 'Wide', board: { equalColumns: true } }] };
    const migrated = decodePreferences(previous);
    expect(migrated.views.all?.board).toEqual({ ...defaultBoardProfile(), equalColumns: true });
    expect(migrated.savedPresets).toEqual([]);
    expect(migrated.ticket).toEqual(current.ticket);
  });
  it('keeps auto-load and equal-width changes independent and includes both in portable presets', () => {
    let current = applyPreferenceAction(defaultPreferences(), { kind: 'board-columns', viewKey: 'all', equal: true });
    current = applyPreferenceAction(current, { kind: 'board-autoload', viewKey: 'all', enabled: true });
    expect(current.views.all?.board).toEqual({ ...defaultBoardProfile(), equalColumns: true, autoLoadItems: true });
    current = applyPreferenceAction(current, { kind: 'board-columns', viewKey: 'all', equal: false });
    expect(current.views.all?.board).toEqual({ ...defaultBoardProfile(), autoLoadItems: true });
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'library', id: 'all-items', name: 'All items', viewKey: 'all' });
    expect(parseConfiguration(JSON.stringify(exportConfiguration(current))).preferences.savedPresets[0]?.board)
      .toEqual({ ...defaultBoardProfile(), autoLoadItems: true });
  });
  it('keeps the native fixture unchanged and rejects malformed new settings', () => {
    const current = defaultPreferences();
    expect(current.version).toBe(11);
    expect(current.views.all?.board).toEqual(defaultBoardProfile());
    expect(() => decodePreferences({ ...current, views: { all: { ...defaultView(), board: { equalColumns: 'true' } } } }))
      .toThrow('Board preferences');
    expect(() => decodePreferenceAction({ kind: 'board-columns', viewKey: 'all', equal: 'true' })).toThrow('invalid');
    expect(decodePreferenceAction({ kind: 'board-columns', viewKey: 'all', equal: true })).toEqual({
      kind: 'board-columns', viewKey: 'all', equal: true,
    });
  });
  it('migrates v6 previews without activating them or altering Ticket settings', () => {
    const current = defaultPreferences();
    current.ticket.layoutLocked = true;
    const appearance = { ...defaultView().appearance, density: 'compact' as const };
    const legacy = { ...current, version: 6, views: { all: { presetId: 'compact', appearance } },
      savedPresets: [{ id: 'old-local', name: 'Local preview', appearance }] };
    const migrated = decodePreferences(legacy);
    expect(migrated.ticket).toEqual(current.ticket);
    expect(migrated.views.all).toEqual({ presetId: 'board:kiwifruit', appearance, board: defaultBoardProfile() });
    expect(migrated.savedPresets).toEqual([]);
    expect(decodePreferences(migrated)).toEqual(migrated);
  });
  it('uses the most specific saved scope independently of the popup editing selection', () => {
    let current = applyPreferenceAction(defaultPreferences(), { kind: 'board-columns', viewKey: 'all', equal: true });
    const project = scopeKey('project', context);
    const board = scopeKey('board', context);
    if (!project || !board) throw new Error('Missing scoped Board context.');
    current = applyPreferenceAction(current, { kind: 'board-columns', viewKey: project, equal: false });
    expect(effectiveBoardView(current, context).board.equalColumns).toBe(false);
    current = applyPreferenceAction(current, { kind: 'board-columns', viewKey: board, equal: true });
    current.scope = 'organization';
    expect(effectiveBoardView(current, context).board.equalColumns).toBe(true);
    expect(effectiveBoardView(current, parseAdoContext('https://dev.azure.com/example/Platform/_boards/board/t/Other/Stories')).board.equalColumns).toBe(false);
  });
  it('does not turn old project preview scopes into implicit overrides of a new global Board setting', () => {
    const project = scopeKey('project', context);
    if (!project) throw new Error('Missing legacy project scope.');
    const legacyView = { presetId: 'balanced', appearance: defaultView().appearance };
    const migrated = decodePreferences({ ...defaultPreferences(), version: 6,
      views: { all: legacyView, [project]: legacyView } });
    const enabled = applyPreferenceAction(migrated, { kind: 'board-columns', viewKey: 'all', equal: true });
    expect(effectiveBoardView(enabled, context).board.equalColumns).toBe(true);
    const explicit = applyPreferenceAction(enabled, { kind: 'board-columns', equal: false, viewKey: project });
    expect(effectiveBoardView(explicit, context).board.equalColumns).toBe(false);
  });
  it('saves portable Board presets without changing Ticket profiles, locks, or Undo', () => {
    const original = defaultPreferences();
    let current = applyPreferenceAction(original, { kind: 'apply-preset', area: 'library', presetId: 'board:kiwifruit', viewKey: 'all' });
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'library', id: 'wide', name: 'Wide Board', viewKey: 'all' });
    expect(current.savedPresets[0]?.board).toEqual({ ...defaultBoardProfile(), equalColumns: true, compactHeader: true, autoLoadItems: true });
    expect(current.ticket).toEqual(original.ticket);
    expect(parseConfiguration(JSON.stringify(exportConfiguration(current))).preferences).toEqual(current);
    current = applyPreferenceAction(current, { kind: 'board-columns', equal: false, viewKey: 'all' });
    expect(current.views.all?.board?.equalColumns).toBe(false);
    current = applyPreferenceAction(current, { kind: 'apply-preset', area: 'library', presetId: 'wide', viewKey: 'all' });
    expect(current.views.all?.board?.equalColumns).toBe(true);
    expect(current.ticket).toEqual(original.ticket);
  });
  it('migrates v8 profiles without activating new presentation or changing either existing flag', () => {
    const current = defaultPreferences();
    const previous = { ...current, version: 8, views: { all: { ...defaultView(), board: { equalColumns: true, autoLoadItems: true } } } };
    const migrated = decodePreferences(previous);
    expect(migrated.views.all?.board).toEqual({ ...defaultBoardProfile(), equalColumns: true, autoLoadItems: true });
    expect(migrated.ticket).toEqual(current.ticket);
  });
  it('saves presentation and fields independently in scopes and portable presets', () => {
    const original = defaultPreferences();
    let current = applyPreferenceAction(original, { kind: 'board-presentation', viewKey: 'all', feature: 'compactCards', enabled: true });
    current = applyPreferenceAction(current, { kind: 'board-presentation', viewKey: 'all', feature: 'compactHeader', enabled: true });
    current = applyPreferenceAction(current, { kind: 'board-card-field', viewKey: 'all', field: 'assignee', visible: false });
    expect(current.views.all?.board).toEqual({ ...defaultBoardProfile(), compactCards: true, compactHeader: true,
      cardFields: { ...defaultBoardProfile().cardFields, assignee: false } });
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'library', id: 'compact', name: 'Compact Board', viewKey: 'all' });
    expect(parseConfiguration(JSON.stringify(exportConfiguration(current))).preferences).toEqual(current);
    expect(current.ticket).toEqual(original.ticket);
  });
  it('rejects malformed presentation flags, unsupported fields and retired column actions', () => {
    expect(() => decodePreferenceAction({ kind: 'board-card-field', viewKey: 'all', field: 'title', visible: false })).toThrow('invalid');
    expect(() => decodePreferenceAction({ kind: 'board-column-state', viewKey: 'all', column: 'closed', collapsed: true })).toThrow('invalid');
    expect(() => decodePreferenceAction({ kind: 'board-presentation', viewKey: 'all', feature: 'rememberColumns', enabled: true })).toThrow('invalid');
    const current = defaultPreferences();
    expect(() => decodePreferences({ ...current, views: { all: { ...defaultView(), board: { ...defaultBoardProfile(), compactCards: 'yes' } } } })).toThrow('presentation');
  });
});
