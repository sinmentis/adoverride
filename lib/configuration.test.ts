import { describe, expect, it } from 'vitest';
import { decodeConfigurationBackup, exportConfiguration, parseConfiguration } from './configuration';
import { applyPreferenceAction, commitPreferenceAction, createPreferencesStore, decodePreferenceAction, defaultPreferences,
  MAX_CONFIGURATION_BYTES, portablePreferences } from './preferences';
import type { Preferences } from './preferences';

describe('portable configuration and acknowledged replacement', () => {
  it('round-trips both banks and presentation without exporting Undo history or a local revision', () => {
    let current = commitPreferenceAction(defaultPreferences(), { kind: 'ticket-target', key: 'group:details/planning', hidden: true }, 'hide-1');
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'ticket', id: 'daily', name: 'Daily' });
    current = applyPreferenceAction(current, { kind: 'save-preset', area: 'library', id: 'daily', name: 'Daily', viewKey: 'all' });
    current = { ...current, revision: 20, ticket: { ...current.ticket, layoutLocked: true } };
    const parsed = parseConfiguration(JSON.stringify(exportConfiguration(current)));
    expect(parsed.preferences).toEqual(portablePreferences(current));
    expect(parsed.preferences.revision).toBe(0);
    expect(parsed.preferences.ticket.undo).toBeNull();
    expect(parsed.preferences.ticket.layoutLocked).toBe(true);
    expect(current.ticket.undo?.id).toBe('hide-1');
  });

  it('rejects unrelated, corrupt, future, and oversized configuration files', () => {
    const file = exportConfiguration(defaultPreferences());
    expect(() => parseConfiguration('{')).toThrow();
    expect(() => parseConfiguration(JSON.stringify({ ...file, version: 2 }))).toThrow('supported');
    expect(() => parseConfiguration(JSON.stringify({ ...file, kind: 'ado-layout-capture' }))).toThrow('supported');
    expect(() => parseConfiguration(JSON.stringify({ ...file, preferences: { ...file.preferences, version: 12 } }))).toThrow('version');
    expect(() => parseConfiguration(' '.repeat(MAX_CONFIGURATION_BYTES + 1))).toThrow('2 MB');
    expect(() => decodeConfigurationBackup({ kind: 'backup' })).toThrow('backup');
  });

  it('rejects stale replacement previews and ignores imported transaction identity', () => {
    const current = { ...defaultPreferences(), revision: 8 };
    const imported = { ...defaultPreferences(), theme: 'dark' as const, revision: 100 };
    expect(() => applyPreferenceAction(current, { kind: 'replace-configuration', preferences: imported, expectedRevision: 7 })).toThrow('preview');
    const action = decodePreferenceAction({ kind: 'replace-configuration', preferences: imported, expectedRevision: 8 });
    const applied = applyPreferenceAction(current, action);
    expect(applied.theme).toBe('dark');
    expect(applied.revision).toBe(0);
    expect(() => decodePreferenceAction({ kind: 'restore-configuration', backupId: '', expectedRevision: 8 })).toThrow();
  });

  it('hands the exact current configuration to the atomic backend and retains both documents after failure', async () => {
    const original = { ...defaultPreferences(), revision: 12 };
    let stored = original;
    let backup: Preferences | undefined;
    let fail = true;
    const store = createPreferencesStore({ read: async () => stored, write: async (next, previous) => {
      if (fail) throw new Error('Storage failed');
      stored = next; if (previous) backup = previous;
    } });
    const update = () => store.update(current => applyPreferenceAction(current, {
      kind: 'replace-configuration', preferences: { ...defaultPreferences(), theme: 'dark' }, expectedRevision: 12,
    }), { backup: true });
    await expect(update()).rejects.toThrow('Storage failed');
    expect(stored).toEqual(original);
    expect(backup).toBeUndefined();
    fail = false;
    await update();
    expect(stored.revision).toBe(13);
    expect(backup).toEqual(original);
    await store.update(async current => ({ ...current, enabled: false }));
    expect(stored.revision).toBe(14);
    expect(backup).toEqual(original);
  });

  it('restores only the listed card rules as one Undo step, leaving fields, layouts and other pages alone', () => {
    const current = defaultPreferences();
    current.ticket.hiddenTargets = ['field:system.description', 'group:details/planning', 'group:details/development', 'group:team/notes'].sort();
    const action = decodePreferenceAction({ kind: 'ticket-restore-cards', keys: ['group:details/planning', 'group:details/development'] });
    const restored = commitPreferenceAction(current, action, 'restore-1');
    expect(restored.ticket.hiddenTargets).toEqual(['field:system.description', 'group:team/notes']);
    expect(restored.ticket.cardLayouts).toEqual(current.ticket.cardLayouts);
    expect(applyPreferenceAction(restored, { kind: 'undo-ticket', id: 'restore-1' }).ticket.hiddenTargets).toEqual(current.ticket.hiddenTargets);
    expect(() => decodePreferenceAction({ kind: 'ticket-restore-cards', keys: ['field:system.description'] })).toThrow();
    expect(() => decodePreferenceAction({ kind: 'ticket-restore-cards', keys: [] })).toThrow();
  });
});
