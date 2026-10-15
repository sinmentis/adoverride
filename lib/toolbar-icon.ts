import { parseAdoContext } from './context';

export const ACTIVE_TOOLBAR_TITLE = 'ADOverride (active)';
export const INACTIVE_TOOLBAR_TITLE = 'ADOverride (inactive)';
export function toolbarIconPaths(active: boolean): Record<number, string> {
  const directory = active ? 'icon' : 'icon-gray';
  return Object.fromEntries([16, 32, 48, 96, 128].map(size => [size, `${directory}/${size}.png`]));
}

// The icon depends only on the tab URL and the master switch, so it never waits on a page script.
export function toolbarActive(url: string | undefined, enabled: boolean): boolean {
  if (!enabled || !url) return false;
  const context = parseAdoContext(url);
  if (!context) return false;
  if (context.pageKind !== 'other') return true;
  return new URL(url).searchParams.has('workitem');
}

export interface ToolbarIconDriver {
  getTab(tabId: number): Promise<{ url?: string }>;
  enabled(): Promise<boolean>;
  setIcon(details: { tabId: number; path: Record<number, string> }): Promise<void>;
  setTitle(details: { tabId: number; title: string }): Promise<void>;
}
interface TabState { request: number; removed: boolean; queue: Promise<void> }

export function createToolbarIconManager(driver: ToolbarIconDriver) {
  const tabs = new Map<number, TabState>();
  return {
    async refresh(tabId: number) {
      let state = tabs.get(tabId);
      if (!state) { state = { request: 0, removed: false, queue: Promise.resolve() }; tabs.set(tabId, state); }
      const request = ++state.request;
      const current = () => !state.removed && state.request === request;
      const [tab, enabled] = await Promise.all([driver.getTab(tabId), driver.enabled()]);
      if (!current()) return;
      const active = toolbarActive(tab.url, enabled);
      // Always redraw: Chrome can reset per-tab icons on navigation or tab replacement.
      const pending = state.queue.then(async () => {
        if (!current()) return;
        await driver.setIcon({ tabId, path: toolbarIconPaths(active) });
        if (!current()) return;
        await driver.setTitle({ tabId, title: active ? ACTIVE_TOOLBAR_TITLE : INACTIVE_TOOLBAR_TITLE });
      });
      state.queue = pending.then(() => undefined, () => undefined);
      return pending;
    },
    remove(tabId: number) {
      const state = tabs.get(tabId);
      if (state) state.removed = true;
      tabs.delete(tabId);
    },
  };
}
