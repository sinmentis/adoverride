// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createPrFiles, readFileEntries } from './pr-files';

function fixture() {
  document.body.innerHTML = `<div class="repos-pr-details-page">
    <div class="repos-pr-title"><input value="Sample change"></div><div class="repos-compare-toolbar"></div>
    <div class="repos-changes-explorer-splitter">
      <div class="vss-Splitter--pane-fixed"><table class="repos-changes-explorer-tree" role="treegrid" aria-rowcount="4"><tbody>
        <tr role="row" aria-level="1" aria-expanded="true"><td class="bolt-tree-cell"><span class="text-ellipsis">src/cache</span></td></tr>
        <tr role="row" aria-level="2" aria-selected="true"><td><div role="checkbox" aria-checked="false"></div></td><td class="bolt-tree-cell"><span class="text-ellipsis">client.go</span></td></tr>
        <tr role="row" aria-level="3"><td class="repos-file-explorer-tree-thread-item">A review comment</td></tr>
        <tr role="row" aria-level="2"><td><div role="checkbox" aria-checked="true"></div></td><td class="bolt-tree-cell"><span class="text-ellipsis">client_test.go</span></td></tr>
      </tbody></table></div><div class="vss-Splitter--pane-flexible"><textarea>Unsaved draft</textarea></div>
    </div></div>`;
  const root = document.querySelector<HTMLElement>('.repos-pr-details-page')!;
  const tree = root.querySelector<HTMLElement>('.repos-changes-explorer-tree')!;
  return { root, tree };
}

describe('native file inventory', () => {
  it('maps paths and review state, without treating comment rows as files', () => {
    const { tree } = fixture();
    expect(readFileEntries(tree)?.map(({ path, reviewed, selected }) => ({ path, reviewed, selected }))).toEqual([
      { path: 'src/cache/client.go', reviewed: false, selected: true },
      { path: 'src/cache/client_test.go', reviewed: true, selected: false },
    ]);
  });
  it.each(['partial', 'collapsed', 'unknown-state', 'duplicate'])('rejects an incomplete or ambiguous tree: %s', reason => {
    const { tree } = fixture();
    if (reason === 'partial') tree.setAttribute('aria-rowcount', '50');
    if (reason === 'collapsed') tree.querySelector('[aria-expanded]')!.setAttribute('aria-expanded', 'false');
    if (reason === 'unknown-state') tree.querySelector('[role=checkbox]')!.setAttribute('aria-checked', 'mixed');
    if (reason === 'duplicate') tree.querySelectorAll('.text-ellipsis')[2]!.textContent = 'client.go';
    expect(readFileEntries(tree)).toBeNull();
  });
});

describe('Files presentation lifecycle', () => {
  const controllers: ReturnType<typeof createPrFiles>[] = [];
  afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); document.body.replaceChildren(); });
  it('keeps native nodes, delegates only explicit actions, and fully restores presentation', () => {
    const { root, tree } = fixture();
    const before = [...root.querySelectorAll('*')].map(node => ({ node, parent: node.parentElement }));
    let selected = 0;
    let reviewed = 0;
    tree.querySelectorAll('.text-ellipsis')[1]!.addEventListener('click', () => selected++);
    tree.querySelector('[role=checkbox]')!.addEventListener('click', () => reviewed++);
    const controller = createPrFiles(document, () => {});
    controllers.push(controller);
    expect(controller.update(root, 'one', 'drawer')).toEqual({ applied: true, message: null });
    expect(selected).toBe(0); expect(reviewed).toBe(0);
    expect(root.querySelector('.ado-files-panel')?.hasAttribute('hidden')).toBe(true);
    root.querySelector<HTMLButtonElement>('.ado-files-primary')!.click();
    const search = root.querySelector<HTMLInputElement>('.ado-files-search')!;
    search.value = 'client_test'; search.dispatchEvent(new Event('input'));
    expect(root.querySelectorAll('.ado-files-file-button')).toHaveLength(1);
    expect(search.value).toBe('client_test');
    controller.update(root, 'one', 'drawer');
    expect(search.value).toBe('client_test');
    search.value = ''; search.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('.ado-files-file-button')!.click();
    expect(selected).toBe(1); expect(reviewed).toBe(0);
    root.querySelector<HTMLButtonElement>('.ado-files-check')!.click();
    expect(reviewed).toBe(1);
    expect(root.querySelector('textarea')!.value).toBe('Unsaved draft');
    controller.clear();
    expect(before.every(({ node, parent }) => node.isConnected && node.parentElement === parent)).toBe(true);
    expect(document.querySelectorAll('[data-ado-files],[data-ado-files-source],[data-ado-files-toolbar],[data-ado-files-focus],[data-ado-files-setup],[inert],[data-ado-pr-ui]')).toHaveLength(0);
    expect(document.querySelector('style[data-ado-pr-style="files"]')).toBeNull();
  });
  it('keeps the wide layout and original tree when the inventory becomes partial', () => {
    const { root, tree } = fixture();
    const controller = createPrFiles(document, () => {});
    controllers.push(controller);
    controller.update(root, 'one', 'bottom');
    const search = root.querySelector<HTMLInputElement>('.ado-files-search')!;
    search.value = 'old'; search.dispatchEvent(new Event('input'));
    controller.update(root, 'two', 'bottom');
    expect(search.value).toBe('');
    tree.setAttribute('aria-rowcount', '100');
    const parent = tree.parentElement;
    expect(controller.update(root, 'two', 'bottom')).toEqual({ applied: true, message: null });
    expect(root.getAttribute('data-ado-files')).toBe('bottom');
    expect(root.getAttribute('data-ado-files-navigation')).toBe('native');
    expect(tree.parentElement).toBe(parent);
    expect(root.querySelector('.vss-Splitter--pane-fixed')!.hasAttribute('inert')).toBe(false);
    expect(root.querySelector<HTMLElement>('.ado-files-content')!.hidden).toBe(true);
    expect(root.querySelector('.ado-files-native-help')?.textContent).toContain('Native file navigation');
    expect(root.querySelectorAll('.ado-files-file-button')).toHaveLength(0);
    tree.setAttribute('aria-rowcount', '4');
    controller.update(root, 'two', 'bottom');
    expect(root.getAttribute('data-ado-files-navigation')).toBe('native');
    controller.update(root, 'three', 'bottom');
    expect(root.getAttribute('data-ado-files-navigation')).toBe('custom');
  });
  it('preserves native source attributes and handles collapsed trees without remounting them', () => {
    const { root, tree } = fixture();
    const source = tree.parentElement!;
    source.id = 'native-source';
    source.setAttribute('tabindex', '0');
    tree.querySelector('[aria-expanded]')!.setAttribute('aria-expanded', 'false');
    const before = [...root.querySelectorAll('*')].map(node => ({ node, parent: node.parentElement }));
    const controller = createPrFiles(document, () => {});
    controllers.push(controller);
    expect(controller.update(root, 'one', 'drawer')).toEqual({ applied: true, message: null });
    expect(source.hasAttribute('inert')).toBe(true);
    root.querySelector<HTMLButtonElement>('.ado-files-primary')!.click();
    expect(source.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(source);
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(source.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('.ado-files-primary'));
    controller.clear();
    expect(before.every(({ node, parent }) => node.isConnected && node.parentElement === parent)).toBe(true);
    expect(source.id).toBe('native-source');
    expect(source.getAttribute('tabindex')).toBe('0');
    expect(source.hasAttribute('inert')).toBe(false);
    expect(root.querySelectorAll('[data-ado-pr-ui]')).toHaveLength(0);
    expect(root.hasAttribute('data-ado-files-navigation')).toBe(false);
  });
  it('does not take over a source that is already inert or an unrecognized tree shell', () => {
    const { root, tree } = fixture();
    const controller = createPrFiles(document, () => {});
    controllers.push(controller);
    tree.parentElement!.setAttribute('inert', '');
    expect(controller.update(root, 'one', 'drawer').applied).toBe(false);
    expect(tree.parentElement!.hasAttribute('inert')).toBe(true);
    tree.parentElement!.removeAttribute('inert');
    tree.removeAttribute('role');
    expect(controller.update(root, 'one', 'drawer').applied).toBe(false);
    expect(root.hasAttribute('data-ado-files')).toBe(false);
  });
});
