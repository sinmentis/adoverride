import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdoContext } from './context';
import { activePage, inspectActivePage } from './extension';
import type { Inspection } from './inspector';

export type InspectorState =
  | { status: 'loading' }
  | { status: 'paused' }
  | { status: 'unsupported' }
  | { status: 'ready'; inspection: Inspection; connection: 'existing' | 'on-demand' }
  | { status: 'error'; message: string };

export function useInspector(enabled: boolean, ready: boolean) {
  const [context, setContext] = useState<AdoContext | null>(null);
  const [state, setState] = useState<InspectorState>({ status: 'loading' });
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    setState({ status: 'loading' });
    try {
      const page = await activePage();
      if (request !== requestId.current) return;
      setContext(page.context);
      if (!enabled) {
        setState({ status: 'paused' });
        return;
      }
      if (!page.context || page.tabId === null) {
        setState({ status: 'unsupported' });
        return;
      }
      const { inspection, connection } = await inspectActivePage(page.tabId);
      if (request !== requestId.current) return;
      setContext(inspection.context);
      setState({ status: 'ready', inspection, connection });
    } catch (reason) {
      console.error('[ADOverride] Could not inspect the active page.', reason);
      if (request === requestId.current) setState({
        status: 'error',
        message: reason instanceof Error ? reason.message : 'Could not inspect the active page.',
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (ready) void refresh();
    return () => { requestId.current++; };
  }, [ready, refresh]);

  return { context, state, refresh };
}
