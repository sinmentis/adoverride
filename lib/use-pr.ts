import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { activePage, inspectActivePage } from './extension';
import { PR_PORT, decodePrSnapshot, emptyPrSnapshot } from './pr';

export function usePr(ready: boolean) {
  const [snapshot, setSnapshot] = useState(emptyPrSnapshot);
  const port = useRef<ReturnType<typeof browser.tabs.connect> | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      try {
        const page = await activePage();
        if (page.context?.pageKind !== 'pullrequest' || page.tabId === null) return;
        await inspectActivePage(page.tabId);
        if (!active) return;
        const connection = browser.tabs.connect(page.tabId, { name: PR_PORT });
        port.current = connection;
        connection.onMessage.addListener((value: unknown) => {
          if (!active) return;
          try { setSnapshot(decodePrSnapshot(value)); }
          catch (reason) {
            console.error('[ADOverride] Invalid pull request status.', reason);
            setSnapshot({ ...emptyPrSnapshot(), status: 'error', message: 'Invalid pull request status.' });
          }
        });
        connection.onDisconnect.addListener(() => {
          if (active) setSnapshot(current => ({ ...current, status: 'error', message: 'The pull request reader disconnected. Reopen the popup.' }));
        });
      } catch (reason) {
        console.error('[ADOverride] Could not connect the pull request reader.', reason);
        if (active) setSnapshot({ ...emptyPrSnapshot(), status: 'error', message: reason instanceof Error ? reason.message : 'Could not connect the pull request reader.' });
      }
    })();
    return () => { active = false; port.current?.disconnect(); port.current = null; };
  }, [ready]);
  return { snapshot, refresh: useCallback(() => port.current?.postMessage({ type: 'refresh' }), []) };
}
