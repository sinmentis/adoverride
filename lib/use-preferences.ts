import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { commitPreferences, mutatePreferences, PREFERENCES_KEY, preferencesStore } from './extension';
import { decodePreferences, defaultPreferences, ticketChangeMessage, type PreferenceAction, type Preferences } from './preferences';
import { idleSaveState, type SaveState } from './save-feedback';
import { isObject } from './ticket';

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>(idleSaveState);
  const [saving, setSaving] = useState(false);
  const requests = useRef(0);
  const pending = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    preferencesStore.load().then(value => {
      if (mounted.current) setPreferences(previous => previous && previous.revision > value.revision ? previous : value);
    }).catch(reason => {
      console.error('[ADO Customize] Could not load preferences.', reason);
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not load preferences.');
    });
    const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !changes[PREFERENCES_KEY]) return;
      try {
        const value: unknown = changes[PREFERENCES_KEY].newValue;
        const decoded = value === undefined ? defaultPreferences() : decodePreferences(value);
        setPreferences(previous => previous && previous.revision > decoded.revision ? previous : decoded);
        setError('');
        const old: unknown = changes[PREFERENCES_KEY].oldValue;
        const oldUndo = isObject(old) && isObject(old.ticket) && isObject(old.ticket.undo) ? old.ticket.undo.id : null;
        if (!pending.current && decoded.ticket.undo && decoded.ticket.undo.id !== oldUndo) {
          setSaveState({ status: 'saved', message: ticketChangeMessage(decoded.ticket.undo.kind), undoId: decoded.ticket.undo.id });
        }
      } catch (reason) {
        console.error('[ADO Customize] Invalid preferences update.', reason);
        setError(reason instanceof Error ? reason.message : 'Invalid preferences update.');
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      mounted.current = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  const update = useCallback(async (action: PreferenceAction): Promise<boolean> => {
    const request = ++requests.current;
    pending.current++;
    setSaving(true);
    setSaveState({ status: 'saving', message: action.kind === 'undo-ticket' ? 'Undoing...' : 'Saving...', undoId: null });
    try {
      const result = await commitPreferences(action);
      if (mounted.current) {
        setPreferences(previous => previous && previous.revision > result.preferences.revision ? previous : result.preferences);
        setError('');
        if (request === requests.current) setSaveState({ status: 'saved', message: result.message, undoId: result.undoId });
      }
      return true;
    } catch (reason) {
      console.error('[ADO Customize] Could not save preferences.', reason);
      if (mounted.current) {
        const message = reason instanceof Error ? reason.message : 'Could not save preferences.';
        setError(message);
        if (request === requests.current) setSaveState({ status: 'error', message, undoId: null });
      }
      return false;
    } finally {
      pending.current--;
      if (mounted.current) setSaving(pending.current > 0);
    }
  }, []);

  const reset = useCallback(async () => {
    try {
      const value = await mutatePreferences({ kind: 'reset-all' });
      if (mounted.current) {
        setPreferences(value);
        setError('');
      }
    } catch (reason) {
      console.error('[ADO Customize] Could not reset preferences.', reason);
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not reset preferences.');
    }
  }, []);

  return { preferences, error, update, reset, saveState, saving, dismissSave: () => {
    setSaveState(idleSaveState());
    if (saveState.status === 'error') setError('');
  } };
}
