import { parseAdoContext } from './context';
import { isObject } from './ticket';

export const TOOLBAR_REPORT = 'ado-customize/toolbar-state';
export const TOOLBAR_QUERY = 'ado-customize/toolbar-state-query';
export const TOOLBAR_VERSION = 1;
export const ACTIVE_TOOLBAR_TITLE = 'ADOverride (active)';
export const INACTIVE_TOOLBAR_TITLE = 'ADOverride (inactive)';
export function toolbarIconPaths(active: boolean): Record<number, string> {
  const directory = active ? 'icon' : 'icon-gray';
  return Object.fromEntries([16, 32, 48, 96, 128].map(size => [size, `${directory}/${size}.png`]));
}
export function decodeToolbarState(value: unknown): boolean {
  if (!isObject(value) || value.version !== TOOLBAR_VERSION || typeof value.effective !== 'boolean') {
    throw new Error('Invalid toolbar activity response.');
  }
  return value.effective;
}
export interface ToolbarIconDriver {
  getTab(tabId: number): Promise<{ url?: string; status?: string }>;
  requestState(tabId: number): Promise<unknown>;
  setIcon(details: { tabId: number; path: Record<number, string> }): Promise<void>;
  setTitle(details: { tabId: number; title: string }): Promise<void>;
}
interface TabState {
  request: number;
  version: number;
  active: boolean | undefined;
  removed: boolean;
  queue: Promise<void>;
}

export function createToolbarIconManager(driver: ToolbarIconDriver) {
  const tabs = new Map<number, TabState>();
  function start(tabId: number) {
    let state = tabs.get(tabId);
    if (!state) {
      state = { request: 0, version: 0, active: undefined, removed: false, queue: Promise.resolve() };
      tabs.set(tabId, state);
    }
    return { state, request: ++state.request };
  }
  const current = (state: TabState, request: number) => !state.removed && state.request === request;
  function apply(tabId: number, state: TabState, request: number, active: boolean) {
    state.version = request;
    const pending = state.queue.then(async () => {
      if (state.removed || state.version !== request || state.active === active) return;
      await driver.setIcon({ tabId, path: toolbarIconPaths(active) });
      if (state.removed || state.version !== request) return;
      await driver.setTitle({ tabId, title: active ? ACTIVE_TOOLBAR_TITLE : INACTIVE_TOOLBAR_TITLE });
      if (!state.removed && state.version === request) state.active = active;
    });
    state.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
  return {
    loading(tabId: number) {
      const { state, request } = start(tabId);
      state.active = undefined;
      return apply(tabId, state, request, false);
    },
    async refresh(tabId: number) {
      const { state, request } = start(tabId);
      const tab = await driver.getTab(tabId);
      if (!current(state, request)) return;
      if (!parseAdoContext(tab.url ?? '') || tab.status === 'loading') {
        await apply(tabId, state, request, false);
        return;
      }
      let active: boolean;
      try { active = decodeToolbarState(await driver.requestState(tabId)); }
      catch (reason) {
        const missing = reason instanceof Error && /receiving end does not exist|could not establish connection|message port closed before a response/i.test(reason.message);
        if (!missing) throw reason;
        active = false;
      }
      if (!current(state, request)) return;
      const latest = await driver.getTab(tabId);
      if (!current(state, request)) return;
      await apply(tabId, state, request, active && latest.url === tab.url && latest.status !== 'loading');
    },
    remove(tabId: number) {
      const state = tabs.get(tabId);
      if (state) state.removed = true;
      tabs.delete(tabId);
    },
  };
}
