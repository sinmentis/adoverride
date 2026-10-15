import { browser } from 'wxt/browser';
import { configurationBackup, PREFERENCE_MESSAGE, PREFERENCES_KEY, preferencesStore } from '@/lib/extension';
import { applyPreferenceAction, commitPreferenceAction, decodePreferenceAction, preferenceSaveMessage } from '@/lib/preferences';
import { isObject } from '@/lib/ticket';
import { createToolbarIconManager } from '@/lib/toolbar-icon';

export default defineBackground(() => {
  const toolbar = createToolbarIconManager({
    getTab: tabId => browser.tabs.get(tabId),
    enabled: async () => (await preferencesStore.load()).enabled,
    setIcon: details => browser.action.setIcon(details),
    setTitle: details => browser.action.setTitle(details),
  });
  const toolbarError = (reason: unknown) => console.error('[ADOverride] Could not update toolbar activity.', reason);
  const refresh = (tabId: number) => { void toolbar.refresh(tabId).catch(toolbarError); };
  const refreshAll = () => browser.tabs.query({}).then(tabs => { for (const tab of tabs) if (tab.id !== undefined) refresh(tab.id); }, toolbarError);
  browser.tabs.onActivated.addListener(({ tabId }) => refresh(tabId));
  browser.tabs.onUpdated.addListener((tabId, changes) => { if (changes.url || changes.status) refresh(tabId); });
  // Prerendered navigations swap the tab ID without an update event for the new tab.
  browser.tabs.onReplaced.addListener((added, removed) => { toolbar.remove(removed); refresh(added); });
  browser.tabs.onRemoved.addListener(tabId => toolbar.remove(tabId));
  browser.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[PREFERENCES_KEY]) void refreshAll(); });
  void refreshAll();
  browser.runtime.onInstalled.addListener(async () => {
    try {
      await preferencesStore.update(current => current);
    } catch (error) {
      console.error('[ADOverride] Could not initialize preferences.', error);
    }
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !isObject(message)) return;
    if (message.type !== PREFERENCE_MESSAGE) return;
    try {
      const action = decodePreferenceAction(message.action);
      let id: string | null = null;
      const pending = action.kind === 'reset-all' ? preferencesStore.reset() :
        action.kind === 'restore-configuration' ? preferencesStore.update(async current => {
          const backup = await configurationBackup();
          if (!backup || backup.id !== action.backupId) throw new Error('The configuration backup changed. Review it again.');
          return applyPreferenceAction(current, { kind: 'replace-configuration', expectedRevision: action.expectedRevision,
            preferences: backup.configuration.preferences });
        }) :
        preferencesStore.update(current => {
          id = crypto.randomUUID();
          return commitPreferenceAction(current, action, id);
        }, { backup: action.kind === 'replace-configuration' });
      void pending.then(
        preferences => sendResponse({ ok: true, preferences, message: preferenceSaveMessage(action),
          undoId: preferences.ticket.undo?.id === id ? id : null }),
        reason => {
          console.error('[ADOverride] Could not commit preferences.', reason);
          sendResponse({ ok: false, error: reason instanceof Error ? reason.message : 'Could not save preferences.' });
        },
      );
    } catch (reason) {
      console.error('[ADOverride] Invalid settings mutation.', reason);
      sendResponse({ ok: false, error: reason instanceof Error ? reason.message : 'Invalid preferences action.' });
    }
    return true;
  });
});
