import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_TOOLBAR_TITLE, createToolbarIconManager, decodeToolbarState, INACTIVE_TOOLBAR_TITLE,
  toolbarIconPaths } from './toolbar-icon';

const address = 'https://dev.azure.com/example/Platform/_workitems/edit/101';
function fixture() {
  const pages = new Map([[1, { url: address, status: 'complete' }], [2, { url: 'https://example.com/', status: 'complete' }]]);
  const driver = {
    getTab: vi.fn(async (tabId: number) => {
      const tab = pages.get(tabId);
      if (!tab) throw new Error('No such tab.');
      return tab;
    }),
    requestState: vi.fn(async (): Promise<unknown> => ({ version: 1, effective: true })),
    setIcon: vi.fn(async (_details: { tabId: number; path: Record<number, string> }) => {}),
    setTitle: vi.fn(async (_details: { tabId: number; title: string }) => {}),
  };
  return { pages, driver, manager: createToolbarIconManager(driver) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('per-tab toolbar activity', () => {
  it('uses the matching blue/gray PNG size set and rejects malformed activity replies', () => {
    expect(toolbarIconPaths(true)).toEqual({ 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 96: 'icon/96.png', 128: 'icon/128.png' });
    expect(toolbarIconPaths(false)).toEqual({ 16: 'icon-gray/16.png', 32: 'icon-gray/32.png', 48: 'icon-gray/48.png', 96: 'icon-gray/96.png', 128: 'icon-gray/128.png' });
    expect(decodeToolbarState({ version: 1, effective: false })).toBe(false);
    expect(() => decodeToolbarState({ version: 2, effective: true })).toThrow('Invalid toolbar');
    expect(() => decodeToolbarState({ version: 1, effective: 'yes' })).toThrow('Invalid toolbar');
  });
  it('refreshes each tab independently and does not repeatedly redraw unchanged activity', async () => {
    const { driver, manager } = fixture();
    await manager.refresh(1);
    await manager.refresh(1);
    await manager.refresh(2);
    expect(driver.requestState).toHaveBeenCalledTimes(2);
    expect(driver.setIcon.mock.calls.map(([details]) => details)).toEqual([
      { tabId: 1, path: toolbarIconPaths(true) }, { tabId: 2, path: toolbarIconPaths(false) },
    ]);
    expect(driver.setTitle.mock.calls.map(([details]) => details)).toEqual([
      { tabId: 1, title: ACTIVE_TOOLBAR_TITLE }, { tabId: 2, title: INACTIVE_TOOLBAR_TITLE },
    ]);
  });
  it('does not let a stale query override a newer live inactive state', async () => {
    const { driver, manager } = fixture();
    const reply = deferred<unknown>();
    driver.requestState.mockReturnValueOnce(reply.promise);
    const refreshing = manager.refresh(1);
    await vi.waitFor(() => expect(driver.requestState).toHaveBeenCalled());
    driver.requestState.mockResolvedValueOnce({ version: 1, effective: false });
    await manager.refresh(1);
    reply.resolve({ version: 1, effective: true });
    await refreshing;
    expect(driver.setIcon).toHaveBeenCalledExactlyOnceWith({ tabId: 1, path: toolbarIconPaths(false) });
  });
  it('resets navigation to gray and never queries unsupported or loading documents', async () => {
    const { pages, driver, manager } = fixture();
    await manager.refresh(1);
    pages.set(1, { url: 'https://example.com/', status: 'loading' });
    await manager.loading(1);
    await manager.refresh(1);
    expect(driver.setIcon).toHaveBeenLastCalledWith({ tabId: 1, path: toolbarIconPaths(false) });
    expect(driver.setIcon).toHaveBeenCalledTimes(2);
    pages.set(1, { url: address, status: 'loading' });
    await manager.refresh(1);
    expect(driver.setIcon).toHaveBeenCalledTimes(2);
    expect(driver.requestState).toHaveBeenCalledTimes(1);
  });
  it('serializes a pending blue write before the final gray navigation state', async () => {
    const { driver, manager } = fixture();
    const gate = deferred<void>();
    driver.setIcon.mockReturnValueOnce(gate.promise);
    const active = manager.refresh(1);
    await vi.waitFor(() => expect(driver.setIcon).toHaveBeenCalled());
    const loading = manager.loading(1);
    gate.resolve();
    await Promise.all([active, loading]);
    expect(driver.setIcon.mock.calls.map(([details]) => details.path[16])).toEqual(['icon/16.png', 'icon-gray/16.png']);
    expect(driver.setTitle).toHaveBeenCalledExactlyOnceWith({ tabId: 1, title: INACTIVE_TOOLBAR_TITLE });
  });
  it('drops an in-flight query when its tab closes', async () => {
    const { pages, driver, manager } = fixture();
    const reply = deferred<unknown>();
    driver.requestState.mockReturnValueOnce(reply.promise);
    const refreshing = manager.refresh(1);
    await vi.waitFor(() => expect(driver.requestState).toHaveBeenCalled());
    manager.remove(1);
    pages.delete(1);
    reply.resolve({ version: 1, effective: true });
    await refreshing;
    expect(driver.setIcon).not.toHaveBeenCalled();
  });
  it('rejects a query from before navigation and recovers from the current document', async () => {
    const { pages, driver, manager } = fixture();
    const reply = deferred<unknown>();
    driver.requestState.mockReturnValueOnce(reply.promise);
    const refreshing = manager.refresh(1);
    await vi.waitFor(() => expect(driver.requestState).toHaveBeenCalled());
    pages.set(1, { url: 'https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories', status: 'complete' });
    reply.resolve({ version: 1, effective: true });
    await refreshing;
    expect(driver.setIcon).toHaveBeenLastCalledWith({ tabId: 1, path: toolbarIconPaths(false) });
    await manager.refresh(1);
    expect(driver.setIcon).toHaveBeenLastCalledWith({ tabId: 1, path: toolbarIconPaths(true) });
  });
  it('treats missing page readers as inactive but surfaces other errors and permits retry', async () => {
    const { driver, manager } = fixture();
    driver.requestState.mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'));
    await manager.refresh(1);
    expect(driver.setIcon).toHaveBeenLastCalledWith({ tabId: 1, path: toolbarIconPaths(false) });
    driver.requestState.mockResolvedValueOnce({});
    await expect(manager.refresh(1)).rejects.toThrow('Invalid toolbar activity');
    driver.setIcon.mockRejectedValueOnce(new Error('Icon failed.'));
    await expect(manager.refresh(1)).rejects.toThrow('Icon failed');
    await manager.refresh(1);
    expect(driver.setTitle).toHaveBeenLastCalledWith({ tabId: 1, title: ACTIVE_TOOLBAR_TITLE });
  });
});
