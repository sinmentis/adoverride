import { browser } from 'wxt/browser';
import { configurationBackup, PREFERENCE_MESSAGE, preferencesStore } from '@/lib/extension';
import { applyPreferenceAction, commitPreferenceAction, decodePreferenceAction, preferenceSaveMessage } from '@/lib/preferences';
import { isObject } from '@/lib/ticket';
import { createToolbarIconManager, decodeToolbarState, TOOLBAR_QUERY, TOOLBAR_REPORT, TOOLBAR_VERSION } from '@/lib/toolbar-icon';

export default defineBackground(() => {
  const toolbar = createToolbarIconManager({
    getTab: tabId => browser.tabs.get(tabId),
    requestState: tabId => browser.tabs.sendMessage(tabId, { type: TOOLBAR_QUERY, version: TOOLBAR_VERSION }),
    setIcon: details => browser.action.setIcon(details),
    setTitle: details => browser.action.setTitle(details),
  });
  const toolbarError = (reason: unknown) => console.error('[ADOverride] Could not update toolbar activity.', reason);
  browser.tabs.onActivated.addListener(({ tabId }) => { void toolbar.refresh(tabId).catch(toolbarError); });
  browser.tabs.onUpdated.addListener((tabId, changes) => {
    if (changes.status === 'loading') void toolbar.loading(tabId).catch(toolbarError);
    else if (changes.url || changes.status === 'complete') void toolbar.refresh(tabId).catch(toolbarError);
  });
  browser.tabs.onRemoved.addListener(tabId => toolbar.remove(tabId));
  void browser.tabs.query({}).then(tabs => Promise.all(tabs.flatMap(tab =>
    tab.id === undefined ? [] : [toolbar.refresh(tab.id)]))).catch(toolbarError);
  browser.runtime.onInstalled.addListener(async () => {
    try {
      await preferencesStore.update(current => current);
    } catch (error) {
      console.error('[ADOverride] Could not initialize preferences.', error);
    }
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !isObject(message)) return;
    if (message.type === TOOLBAR_REPORT) {
      if (sender.tab?.id === undefined || sender.frameId !== 0 || !sender.url) return;
      try {
        decodeToolbarState(message);
        // Chrome keeps sender.url at the injection URL during same-document navigation.
        void toolbar.refresh(sender.tab.id).then(
          () => sendResponse({ ok: true }),
          reason => { toolbarError(reason); sendResponse({ ok: false, error: 'Could not update toolbar activity.' }); },
        );
      } catch (reason) {
        toolbarError(reason); sendResponse({ ok: false, error: 'Invalid toolbar activity report.' });
      }
      return true;
    }
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
