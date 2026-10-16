import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_TOOLBAR_TITLE, createToolbarIconManager, INACTIVE_TOOLBAR_TITLE, toolbarActive, toolbarIconPaths } from './toolbar-icon';

const address = 'https://dev.azure.com/example/Platform/_workitems/edit/101';
function fixture() {
  const pages = new Map<number, { url?: string }>([[1, { url: address }], [2, { url: 'https://example.com/' }]]);
  let enabled = true;
  const driver = {
    getTab: vi.fn(async (tabId: number) => {
      const tab = pages.get(tabId);
      if (!tab) throw new Error('No such tab.');
      return tab;
    }),
    enabled: vi.fn(async () => enabled),
    setIcon: vi.fn(async (_details: { tabId: number; path: Record<number, string> }) => {}),
    setTitle: vi.fn(async (_details: { tabId: number; title: string }) => {}),
  };
  return { pages, driver, setEnabled: (value: boolean) => { enabled = value; }, manager: createToolbarIconManager(driver) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('URL-based toolbar activity', () => {
  it('uses the matching blue/gray PNG size sets', () => {
    expect(toolbarIconPaths(true)).toEqual({ 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 96: 'icon/96.png', 128: 'icon/128.png' });
    expect(toolbarIconPaths(false)).toEqual({ 16: 'icon-gray/16.png', 32: 'icon-gray/32.png', 48: 'icon-gray/48.png', 96: 'icon-gray/96.png', 128: 'icon-gray/128.png' });
  });
  it.each([
    ['https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories?System.AssignedTo=%40me', true],
    ['https://example.visualstudio.com/Platform/_boards/board/t/Team%20A/Stories', true],
    ['https://dev.azure.com/example/Platform/_sprints/taskboard/Team', true],
    ['https://dev.azure.com/example/Platform/_backlogs/backlog/Team/Stories', true],
    ['https://dev.azure.com/example/Platform/_queries/query/example', true],
    [address, true],
    ['https://dev.azure.com/example/Platform/_git/repo?workitem=101', true],
    ['https://dev.azure.com/example/Platform/_git/repo', false],
    ['https://dev.azure.com/example/Platform/_git/repo/pullrequest/42', true],
    ['https://dev.azure.com/example/Platform/_git/repo/pullrequest/42?_a=files', true],
    ['https://dev.azure.com/example/Platform/_dashboards', false],
    ['https://example.com/_boards/board', false],
    ['http://dev.azure.com/example/Platform/_boards/board', false],
    ['chrome://extensions', false],
    [undefined, false],
  ])('decides %s from the URL alone', (url, active) => {
    expect(toolbarActive(url, true)).toBe(active);
    expect(toolbarActive(url, false)).toBe(false);
  });
  it('redraws every refresh so a Chrome per-tab reset cannot leave a stale gray icon', async () => {
    const { driver, manager } = fixture();
    await manager.refresh(1);
    await manager.refresh(1);
    await manager.refresh(2);
    expect(driver.setIcon.mock.calls.map(([details]) => details)).toEqual([
      { tabId: 1, path: toolbarIconPaths(true) }, { tabId: 1, path: toolbarIconPaths(true) }, { tabId: 2, path: toolbarIconPaths(false) },
    ]);
    expect(driver.setTitle).toHaveBeenLastCalledWith({ tabId: 2, title: INACTIVE_TOOLBAR_TITLE });
  });
  it('follows the master switch and URL changes', async () => {
    const { pages, driver, setEnabled, manager } = fixture();
    setEnabled(false);
    await manager.refresh(1);
    expect(driver.setTitle).toHaveBeenLastCalledWith({ tabId: 1, title: INACTIVE_TOOLBAR_TITLE });
    setEnabled(true);
    await manager.refresh(1);
    expect(driver.setTitle).toHaveBeenLastCalledWith({ tabId: 1, title: ACTIVE_TOOLBAR_TITLE });
    pages.set(1, { url: 'https://dev.azure.com/example/Platform/_git/repo' });
    await manager.refresh(1);
    expect(driver.setIcon).toHaveBeenLastCalledWith({ tabId: 1, path: toolbarIconPaths(false) });
  });
  it('does not let a slow earlier read override a newer state', async () => {
    const { pages, driver, manager } = fixture();
    const slow = deferred<{ url?: string }>();
    driver.getTab.mockReturnValueOnce(slow.promise);
    const first = manager.refresh(1);
    pages.set(1, { url: 'https://dev.azure.com/example/Platform/_git/repo' });
    await manager.refresh(1);
    slow.resolve({ url: address });
    await first;
    expect(driver.setIcon).toHaveBeenCalledExactlyOnceWith({ tabId: 1, path: toolbarIconPaths(false) });
  });
  it('serializes writes so a pending blue write is followed by the newer gray state', async () => {
    const { pages, driver, manager } = fixture();
    const gate = deferred<void>();
    driver.setIcon.mockReturnValueOnce(gate.promise);
    const active = manager.refresh(1);
    await vi.waitFor(() => expect(driver.setIcon).toHaveBeenCalled());
    pages.set(1, { url: 'https://example.com/' });
    const inactive = manager.refresh(1);
    gate.resolve();
    await Promise.all([active, inactive]);
    expect(driver.setIcon.mock.calls.map(([details]) => details.path[16])).toEqual(['icon/16.png', 'icon-gray/16.png']);
    expect(driver.setTitle).toHaveBeenCalledExactlyOnceWith({ tabId: 1, title: INACTIVE_TOOLBAR_TITLE });
  });
  it('drops an in-flight refresh when its tab closes and surfaces icon errors for retry', async () => {
    const { driver, manager } = fixture();
    const slow = deferred<{ url?: string }>();
    driver.getTab.mockReturnValueOnce(slow.promise);
    const refreshing = manager.refresh(1);
    manager.remove(1);
    slow.resolve({ url: address });
    await refreshing;
    expect(driver.setIcon).not.toHaveBeenCalled();
    driver.setIcon.mockRejectedValueOnce(new Error('Icon failed.'));
    await expect(manager.refresh(1)).rejects.toThrow('Icon failed');
    await manager.refresh(1);
    expect(driver.setTitle).toHaveBeenLastCalledWith({ tabId: 1, title: ACTIVE_TOOLBAR_TITLE });
  });
});
