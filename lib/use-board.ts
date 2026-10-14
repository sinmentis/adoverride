import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { activePage, inspectActivePage } from './extension';
import { BOARD_PORT, decodeBoardSnapshot, emptyBoardSnapshot } from './board';

export function useBoard(ready: boolean) {
  const [snapshot, setSnapshot] = useState(emptyBoardSnapshot);
  const port = useRef<ReturnType<typeof browser.tabs.connect> | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      try {
        const page = await activePage();
        if (!page.context || page.tabId === null) return;
        await inspectActivePage(page.tabId);
        if (!active) return;
        const connection = browser.tabs.connect(page.tabId, { name: BOARD_PORT });
        port.current = connection;
        connection.onMessage.addListener((value: unknown) => {
          if (!active) return;
          try { setSnapshot(decodeBoardSnapshot(value)); }
          catch (reason) {
            console.error('[ADOverride] Invalid Board status.', reason);
            setSnapshot({ ...emptyBoardSnapshot(), status: 'error', message: 'Invalid Board status.' });
          }
        });
        connection.onDisconnect.addListener(() => {
          if (active) setSnapshot(current => ({ ...current, status: 'error', effective: false, message: 'The Board reader disconnected. Reopen the popup.' }));
        });
      } catch (reason) {
        console.error('[ADOverride] Could not connect Board reader.', reason);
        if (active) setSnapshot({ ...emptyBoardSnapshot(), status: 'error', message: reason instanceof Error ? reason.message : 'Could not connect Board reader.' });
      }
    })();
    return () => { active = false; port.current?.disconnect(); port.current = null; };
  }, [ready]);
  return { snapshot, refresh: useCallback(() => port.current?.postMessage({ type: 'refresh' }), []),
    retryAutoLoad: useCallback(() => {
      try {
        if (!port.current) throw new Error('The Board reader is not connected.');
        port.current.postMessage({ type: 'retry-autoload' });
      } catch (reason) {
        console.error('[ADOverride] Could not retry Board auto-loading.', reason);
        setSnapshot(current => ({ ...current, status: 'error', effective: false, message: 'Could not retry auto-loading. Reopen the popup.' }));
      }
    }, []) };
}
