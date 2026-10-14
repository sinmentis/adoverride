import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { activePage, inspectActivePage } from './extension';
import { decodeTicketSnapshot, emptyTicketSnapshot, TICKET_PORT, type TicketSnapshot } from './ticket';

export function useTicket(ready: boolean) {
  const [snapshot, setSnapshot] = useState<TicketSnapshot>(emptyTicketSnapshot);
  const port = useRef<ReturnType<typeof browser.tabs.connect> | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      try {
        const page = await activePage();
        if (!page.context || page.tabId === null) {
          if (active) setSnapshot(emptyTicketSnapshot());
          return;
        }
        await inspectActivePage(page.tabId);
        if (!active) return;
        const connection = browser.tabs.connect(page.tabId, { name: TICKET_PORT });
        port.current = connection;
        connection.onMessage.addListener((value: unknown) => {
          if (!active) return;
          try { setSnapshot(decodeTicketSnapshot(value)); }
          catch (reason) {
            console.error('[ADO Customize] Invalid Ticket catalog.', reason);
            setSnapshot({ ...emptyTicketSnapshot(), status: 'error', message: reason instanceof Error ? reason.message : 'Invalid Ticket catalog.' });
          }
        });
        connection.onDisconnect.addListener(() => {
          if (active) setSnapshot(current => ({ ...current, status: 'error', message: 'The Ticket reader disconnected. Reload the extension popup.' }));
        });
      } catch (reason) {
        console.error('[ADO Customize] Could not connect Ticket reader.', reason);
        if (active) setSnapshot({ ...emptyTicketSnapshot(), status: 'error', message: reason instanceof Error ? reason.message : 'Could not connect Ticket reader.' });
      }
    })();
    return () => { active = false; port.current?.disconnect(); port.current = null; };
  }, [ready]);
  const refresh = useCallback(() => port.current?.postMessage({ type: 'refresh' }), []);
  return { snapshot, refresh };
}
