import { browser } from 'wxt/browser';
import { inspectPage, INSPECT_PROTOCOL, isInspectRequest, type InspectionReply } from '@/lib/inspector';
import { commitPreferences, PREFERENCES_KEY, preferencesStore } from '@/lib/extension';
import { decodePreferences, type Preferences } from '@/lib/preferences';
import { createTicketController } from '@/lib/ticket-controller';
import { createTicketDragUi } from '@/lib/ticket-drag';
import { createSaveFeedbackUi } from '@/lib/save-feedback';
import { createTicketVisibilityUi } from '@/lib/ticket-visibility';
import { isObject, TICKET_PORT } from '@/lib/ticket';
import { LAYOUT_MESSAGE } from '@/lib/layout-diagnostics';
import { createBoardController } from '@/lib/board-controller';
import { BOARD_PORT } from '@/lib/board';
import { captureBoardLayout } from '@/lib/board-layout-report';
import { createPrController } from '@/lib/pr-controller';
import { PR_PORT } from '@/lib/pr';

export default defineContentScript({
  matches: ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  main(context) {
    const controller = createTicketController(document, () => location.href, undefined, {
      savePreferences: commitPreferences,
      createFeedbackUi: undo => createSaveFeedbackUi(context, undo),
      createVisibilityUi: (commit, reportError) => createTicketVisibilityUi(context, commit, reportError),
      createDragUi: (commit, trace, reportError) => createTicketDragUi(context, commit, trace, reportError),
    });
    const board = createBoardController(document, () => location.href);
    const pr = createPrController(document, () => location.href);
    let settingsRevision = -1;
    let settingsGeneration = 0;
    const applySettings = (value: Preferences) => {
      if (value.revision < settingsRevision) return;
      settingsRevision = value.revision;
      controller.setPreferences(value); board.setPreferences(value); pr.setPreferences(value);
    };
    const loadSettings = () => {
      const generation = settingsGeneration;
      void preferencesStore.load().then(value => {
        if (context.isValid && generation === settingsGeneration) applySettings(value);
      }).catch(reason => {
        console.error('[ADOverride] Ticket settings unavailable.', reason);
        if (context.isValid && generation === settingsGeneration) {
          const message = reason instanceof Error ? reason.message : 'Settings unavailable.';
          controller.failSettings(message); board.failSettings(message); pr.failSettings(message);
        }
      });
    };
    loadSettings();
    const settingsListener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !changes[PREFERENCES_KEY]) return;
      settingsGeneration++;
      try {
        const value = decodePreferences(changes[PREFERENCES_KEY].newValue);
        applySettings(value);
      }
      catch (reason) {
        console.error('[ADOverride] Invalid Ticket settings.', reason);
        const message = reason instanceof Error ? reason.message : 'Invalid settings.';
        controller.failSettings(message); board.failSettings(message); pr.failSettings(message);
      }
    };
    browser.storage.onChanged.addListener(settingsListener);
    const connectListener: Parameters<typeof browser.runtime.onConnect.addListener>[0] = port => {
      if (port.sender?.id !== browser.runtime.id) return;
      const reader = port.name === TICKET_PORT ? controller : port.name === BOARD_PORT ? board : port.name === PR_PORT ? pr : null;
      if (!reader) return;
      const unsubscribe = reader.subscribe(value => port.postMessage(value));
      port.onMessage.addListener((message: unknown) => {
        if (isObject(message) && message.type === 'refresh') reader.refresh();
        if (port.name === BOARD_PORT && isObject(message) && message.type === 'retry-autoload') board.retryAutoLoad();
      });
      port.onDisconnect.addListener(unsubscribe);
      context.onInvalidated(() => { unsubscribe(); port.disconnect(); });
    };
    browser.runtime.onConnect.addListener(connectListener);
    context.addEventListener(window, 'wxt:locationchange', () => { controller.refresh(); board.refresh(); pr.refresh(); });
    context.onInvalidated(() => {
      browser.storage.onChanged.removeListener(settingsListener);
      browser.runtime.onConnect.removeListener(connectListener);
      controller.dispose();
      board.dispose();
      pr.dispose();
    });
    const listener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return;
      if (isObject(message) && message.type === LAYOUT_MESSAGE) {
        try {
          if (message.command === 'board') {
            sendResponse({ ok: true, ...captureBoardLayout(document) });
            return;
          }
          if (message.command !== 'start' && message.command !== 'export') throw new Error('Invalid layout diagnostics command.');
          if (message.command === 'start') controller.startLayoutRecording();
          sendResponse({ ok: true, ...controller.exportLayoutRecording() });
        } catch (reason) {
          console.error('[ADOverride] Layout diagnostics failed.', reason);
          sendResponse({ ok: false, error: reason instanceof Error ? reason.message : 'Could not read layout diagnostics.' });
        }
        return;
      }
      if (!isInspectRequest(message)) return;
      let reply: InspectionReply;
      try {
        reply = { version: INSPECT_PROTOCOL, ok: true, inspection: inspectPage(document, location.href) };
      } catch (error) {
        console.error('[ADOverride] Read-only inspection failed.', error);
        reply = { version: INSPECT_PROTOCOL, ok: false, error: error instanceof Error ? error.message : 'The page inspector failed.' };
      }
      sendResponse(reply);
    };
    browser.runtime.onMessage.addListener(listener);
    context.onInvalidated(() => browser.runtime.onMessage.removeListener(listener));
  },
});
