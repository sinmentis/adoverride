import { describe, expect, it } from 'vitest';
import { applyPreferenceAction, commitPreferenceAction, decodePreferences } from './preferences';
import { exportConfiguration, parseConfiguration } from './configuration';
import { visualWorkspaceColumns, type CardLayout } from './card-layout';
import { nativePreferences } from '../tests/preferences-fixture';

const native: CardLayout = [['group:details/description'], ['group:details/planning'], ['group:details/development']];
const workspace: CardLayout = [['group:details/description'], ['group:details/planning', 'group:details/development'], []];

describe('independent Workspace presentation', () => {
  it('retains the existing view when migrating v5 layouts, presets, lock, and Undo', () => {
    let current = commitPreferenceAction(nativePreferences(), {
      kind: 'ticket-card-move', page: 'page:details', key: 'group:details/planning', column: 2, before: null, native,
    }, 'move-1');
    current.ticket.layoutLocked = true;
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'ticket', id: 'daily', name: 'Daily' });
    const legacy = JSON.parse(JSON.stringify(current));
    legacy.version = 5;
    delete legacy.ticket.viewMode; delete legacy.ticket.workspaceLayouts;
    delete legacy.ticket.undo.previous.viewMode; delete legacy.ticket.undo.previous.workspaceLayouts;
    for (const preset of legacy.ticket.savedPresets) { delete preset.ticket.viewMode; delete preset.ticket.workspaceLayouts; }
    const migrated = decodePreferences(legacy);
    expect(migrated.version).toBe(11);
    expect(migrated.ticket.viewMode).toBe('native');
    expect(migrated.ticket.workspaceLayouts).toEqual({});
    expect(migrated.ticket.cardLayouts).toEqual(current.ticket.cardLayouts);
    expect(migrated.ticket.undo?.id).toBe('move-1');
    expect(migrated.ticket.layoutLocked).toBe(true);
    expect(migrated.ticket.savedPresets).toEqual([]);
    expect(decodePreferences(migrated)).toEqual(migrated);
  });

  describe('Workspace lane geometry', () => {
    const visible = new Set(workspace.flat());
    const sizes = new Map(workspace.flat().map(key => [key, { width: key.endsWith('description') ? 960 : 280,
      minimumWidth: key.endsWith('description') ? 480 : 240 }]));
    it('gives primary content the wide lane and leaves a readable, bounded properties rail', () => {
      const columns = visualWorkspaceColumns(workspace, visible, 1452, sizes, true);
      expect(columns).toHaveLength(2);
      expect(columns[0]?.width).toBeGreaterThan(1000);
      expect(columns[1]?.width).toBeGreaterThanOrEqual(320);
      expect(columns[1]?.width).toBeLessThanOrEqual(440);
      expect((columns[0]?.width ?? 0) + (columns[1]?.width ?? 0) + 16).toBe(1452);
    });
    it('stacks narrow views, expands a sole rail, and reserves metadata without fake card identities', () => {
      expect(visualWorkspaceColumns(workspace, visible, 700, sizes, true)).toEqual([{
        column: 0, keys: workspace.flat(), x: 0, width: 700,
      }]);
      expect(visualWorkspaceColumns(workspace, new Set(), 1200, sizes, true)).toEqual([{
        column: 1, keys: [], x: 0, width: 1200,
      }]);
      expect(visualWorkspaceColumns(workspace, new Set(), 1200, sizes)).toEqual([]);
    });
    it('keeps a moved editor readable and refuses invalid widths or an unsupported third lane', () => {
      const moved: CardLayout = [[], workspace.flat(), []];
      expect(visualWorkspaceColumns(moved, visible, 700, sizes, true)[0]?.width).toBe(700);
      expect(() => visualWorkspaceColumns(workspace, visible, 0, sizes)).toThrow('Workspace');
      expect(() => visualWorkspaceColumns(native, visible, 1200, sizes)).toThrow('Workspace');
    });
  });

  it('switches views as one undoable change without touching positions, hiding, Library, or lock', () => {
    const current = nativePreferences();
    current.ticket.cardLayouts = { 'page:details': native };
    current.ticket.hiddenTargets = ['group:details/planning'];
    current.ticket.layoutLocked = true;
    const changed = commitPreferenceAction(current, { kind: 'ticket-view', viewMode: 'workspace' }, 'view-1');
    expect(changed.ticket.viewMode).toBe('workspace');
    expect(changed.ticket.cardLayouts).toEqual(current.ticket.cardLayouts);
    expect(changed.ticket.hiddenTargets).toEqual(current.ticket.hiddenTargets);
    expect(changed.views).toEqual(current.views);
    expect(changed.ticket.layoutLocked).toBe(true);
    const restored = applyPreferenceAction(changed, { kind: 'undo-ticket', id: 'view-1' });
    expect(restored.ticket.viewMode).toBe('native');
    expect(restored.ticket.layoutLocked).toBe(true);
  });

  it('saves Workspace moves separately and resets only the active layout', () => {
    const current = nativePreferences();
    current.ticket.cardLayouts = { 'page:details': native };
    let changed = applyPreferenceAction(current, { kind: 'ticket-view', viewMode: 'workspace' });
    changed = commitPreferenceAction(changed, { kind: 'ticket-card-move', viewMode: 'workspace', page: 'page:details',
      key: 'group:details/planning', column: 0, before: null, native: workspace }, 'workspace-move');
    expect(changed.ticket.workspaceLayouts['page:details']?.[0]).toContain('group:details/planning');
    expect(changed.ticket.cardLayouts).toEqual(current.ticket.cardLayouts);
    const reset = commitPreferenceAction(changed, { kind: 'reset-ticket-layout' }, 'workspace-reset');
    expect(reset.ticket.workspaceLayouts).toEqual({});
    expect(reset.ticket.cardLayouts).toEqual(current.ticket.cardLayouts);
    expect(applyPreferenceAction(reset, { kind: 'undo-ticket', id: 'workspace-reset' }).ticket.workspaceLayouts).toEqual(changed.ticket.workspaceLayouts);
  });

  it('rejects stale-view moves, unsupported lanes, corrupt profiles, and moves while locked', () => {
    const current = applyPreferenceAction(nativePreferences(), { kind: 'ticket-view', viewMode: 'workspace' });
    const move = { kind: 'ticket-card-move', viewMode: 'workspace', page: 'page:details',
      key: 'group:details/planning', column: 0, before: null, native: workspace } as const;
    expect(() => applyPreferenceAction(current, { ...move, viewMode: 'native' })).toThrow('view changed');
    expect(() => applyPreferenceAction(current, { ...move, column: 2 })).toThrow('Workspace');
    expect(() => decodePreferences({ ...current, ticket: { ...current.ticket, viewMode: 'future' } })).toThrow('view');
    expect(() => decodePreferences({ ...current, ticket: { ...current.ticket, workspaceLayouts: { 'page:details': native } } })).toThrow('Workspace');
    expect(() => applyPreferenceAction({ ...current, ticket: { ...current.ticket, layoutLocked: true } }, move)).toThrow('locked');
  });

  it('includes both arrangements and the view in Ticket presets and configuration, but not in Library presets', () => {
    let current = nativePreferences();
    current.ticket.cardLayouts = { 'page:details': native };
    current.ticket.workspaceLayouts = { 'page:details': workspace };
    current = applyPreferenceAction(current, { kind: 'ticket-view', viewMode: 'workspace' });
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'ticket', id: 'work', name: 'Work' });
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'library', id: 'work', name: 'Work', viewKey: 'all' });
    current = applyPreferenceAction(current, { kind: 'apply-preset', area: 'ticket', presetId: 'ticket:kiwifruit' });
    expect(current.ticket.viewMode).toBe('workspace');
    current = applyPreferenceAction(current, { kind: 'apply-preset', area: 'ticket', presetId: 'work' });
    expect(current.ticket.viewMode).toBe('workspace');
    expect(current.ticket.cardLayouts).toEqual({ 'page:details': native });
    expect(current.ticket.workspaceLayouts).toEqual({ 'page:details': workspace });
    expect(current.savedPresets[0]?.ticket).toBeUndefined();
    expect(parseConfiguration(JSON.stringify(exportConfiguration(current))).preferences.ticket).toMatchObject({
      viewMode: 'workspace', workspaceLayouts: current.ticket.workspaceLayouts, cardLayouts: current.ticket.cardLayouts,
    });
  });
});
