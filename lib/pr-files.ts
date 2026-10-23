import type { PrFilesPosition } from './pr';
import css from './pr-files.css?inline';

const UI = 'data-ado-pr-ui';
const ROOT = 'data-ado-files';
const SOURCE = 'data-ado-files-source';
const TOOLBAR = 'data-ado-files-toolbar';
const SETUP = 'data-ado-files-setup';
const NAVIGATION = 'data-ado-files-navigation';

interface FileEntry {
  path: string;
  folder: string;
  name: string;
  reviewed: boolean;
  selected: boolean;
  row: HTMLElement;
  target: HTMLElement;
  checkbox: HTMLElement;
}
interface Surface {
  root: HTMLElement;
  splitter: HTMLElement;
  source: HTMLElement;
  tree: HTMLElement;
  editor: HTMLElement;
  toolbar: HTMLElement;
}
export interface FilesResult { applied: boolean; message: string | null }

export function readFileEntries(tree: HTMLElement): FileEntry[] | null {
  const rows = [...tree.querySelectorAll<HTMLElement>('tr[role="row"][aria-level]')];
  const total = Number(tree.getAttribute('aria-rowcount'));
  // Only a complete inventory can be copied into custom navigation.
  if (!rows.length || !Number.isSafeInteger(total) || total !== rows.length) return null;
  const folders = new Map<number, string>();
  const entries: FileEntry[] = [];
  const paths = new Set<string>();
  for (const row of rows) {
    if (row.querySelector('.repos-file-explorer-tree-thread-item')) continue;
    const level = Number(row.getAttribute('aria-level'));
    if (!Number.isSafeInteger(level) || level < 1 || level > 100) return null;
    for (const key of folders.keys()) if (key >= level) folders.delete(key);
    const label = row.querySelector<HTMLElement>('.bolt-tree-cell .text-ellipsis');
    const name = label?.textContent?.trim();
    if (!label || !name) return null;
    if (row.getAttribute('aria-expanded') === 'false') return null;
    const folder = [...folders.entries()].sort(([a], [b]) => a - b).map(([, value]) => value).join('/');
    const isFolder = row.hasAttribute('aria-expanded') || Boolean(row.querySelector('.ms-Icon--Folder,.ms-Icon--FolderHorizontal'));
    if (isFolder) { folders.set(level, name); continue; }
    const checkbox = row.querySelector<HTMLElement>('[role="checkbox"][aria-checked]');
    const checked = checkbox?.getAttribute('aria-checked');
    if (!checkbox || checked !== 'true' && checked !== 'false') return null;
    const path = `${folder ? `${folder}/` : ''}${name}`;
    if (paths.has(path)) return null;
    paths.add(path);
    entries.push({ path, name, folder, reviewed: checked === 'true',
      selected: row.getAttribute('aria-selected') === 'true' || row.classList.contains('selected'),
      row, target: label, checkbox });
  }
  return entries.length ? entries : null;
}

function surface(root: HTMLElement): Surface | null {
  const splitters = root.querySelectorAll<HTMLElement>('.repos-changes-explorer-splitter');
  const toolbar = root.querySelector<HTMLElement>('.repos-compare-toolbar');
  const splitter = splitters.length === 1 ? splitters[0] : null;
  const source = splitter?.querySelector<HTMLElement>(':scope > .vss-Splitter--pane-fixed');
  const editor = splitter?.querySelector<HTMLElement>(':scope > .vss-Splitter--pane-flexible');
  const tree = source?.querySelector<HTMLElement>('.repos-changes-explorer-tree[role="treegrid"]');
  return splitter && source && editor && tree && toolbar ? { root, splitter, source, editor, tree, toolbar } : null;
}

export function createPrFiles(document: Document, changed: () => void) {
  let mounted: Surface | null = null;
  let position: PrFilesPosition = 'drawer';
  let key = '';
  let opened = false;
  let pinned = false;
  let filter: 'all' | 'unreviewed' = 'all';
  let entries: FileEntry[] = [];
  let listSignature = '';
  let message: string | null = null;
  let nativeNavigation = false;
  let sourceAttributes: { id: string | null; tabindex: string | null } | null = null;
  let viewSizes = '';
  const style = document.createElement('style');
  style.setAttribute('data-ado-pr-style', 'files');
  style.textContent = css;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (className: string, text: string, action: () => void) => {
    const element = make('button', className, text);
    element.type = 'button';
    element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action(); });
    return element;
  };
  const controls = make('div', 'ado-files-controls');
  controls.setAttribute(UI, 'files-controls');
  const trigger = button('ado-files-button ado-files-primary', 'Files', () => {
    opened = !opened; applyLayout();
    if (opened) focusNavigation();
  });
  trigger.setAttribute('aria-haspopup', 'dialog');
  controls.append(trigger);
  const panel = make('section', 'ado-files-panel');
  panel.setAttribute(UI, 'files-panel');
  panel.setAttribute('aria-label', 'Changed files');
  panel.id = `ado-files-${crypto.randomUUID()}`;
  trigger.setAttribute('aria-controls', panel.id);
  const heading = make('div', 'ado-files-heading');
  const count = make('strong', '', 'Changed files');
  const pin = button('ado-files-button ado-files-subtle', 'Pin', () => { pinned = !pinned; applyLayout(); });
  const close = button('ado-files-button ado-files-subtle', 'Close', () => {
    opened = !opened; applyLayout();
    if (opened) focusNavigation();
    else trigger.focus({ preventScroll: true });
  });
  heading.append(count, pin, close);
  const content = make('div', 'ado-files-content');
  const nativeHelp = make('div', 'ado-files-native-help', "Native file navigation. Use ADO's Filter.");
  nativeHelp.hidden = true;
  const tools = make('div', 'ado-files-tools');
  const search = make('input', 'ado-files-search');
  search.type = 'search'; search.placeholder = 'Find file...'; search.autocomplete = 'off';
  search.setAttribute('aria-label', 'Find changed file');
  search.addEventListener('input', () => renderList());
  const filters = make('div', 'ado-files-filters');
  const all = button('ado-files-chip', 'All', () => { filter = 'all'; renderList(); });
  const unreviewed = button('ado-files-chip', 'Unreviewed', () => { filter = 'unreviewed'; renderList(); });
  filters.append(all, unreviewed);
  tools.append(search, filters);
  const list = make('div', 'ado-files-list');
  const feedback = make('div', 'ado-files-feedback');
  feedback.setAttribute('role', 'status');
  content.append(tools, list);
  panel.append(heading, nativeHelp, content, feedback);
  const notice = make('div', 'ado-files-notice');
  notice.setAttribute(UI, 'files-notice');
  notice.setAttribute('role', 'status');

  function focusNavigation() {
    if (nativeNavigation) mounted?.source.focus({ preventScroll: true });
    else search.focus({ preventScroll: true });
  }
  function resizeEditor(editor: HTMLElement, source: HTMLElement) {
    if (!editor.isConnected) return;
    const { width, height } = editor.getBoundingClientRect();
    const treeSize = source.getBoundingClientRect();
    const sizes = JSON.stringify([width, height, treeSize.width, treeSize.height]);
    if (width <= 0 || height <= 0 || sizes === viewSizes) return;
    viewSizes = sizes;
    // Monaco and the virtual file tree need their native resize handlers.
    document.defaultView?.dispatchEvent(new Event('resize'));
  }
  function applyLayout(notify = true) {
    if (!mounted) return;
    mounted.root.setAttribute(ROOT, position);
    mounted.root.setAttribute(NAVIGATION, nativeNavigation ? 'native' : 'custom');
    mounted.source.setAttribute(SOURCE, nativeNavigation && opened ? 'visible' : '');
    mounted.source.toggleAttribute('inert', !nativeNavigation || !opened);
    content.hidden = nativeNavigation;
    nativeHelp.hidden = !nativeNavigation || !opened;
    if (nativeNavigation) {
      if (!mounted.source.id) mounted.source.id = `${panel.id}-native`;
      if (!mounted.source.hasAttribute('tabindex')) mounted.source.tabIndex = -1;
      panel.setAttribute('aria-owns', mounted.source.id);
      count.textContent = 'Changed files';
    } else panel.removeAttribute('aria-owns');
    mounted.toolbar.setAttribute(TOOLBAR, '');
    panel.hidden = position === 'drawer' && !opened;
    panel.setAttribute('role', position === 'drawer' ? 'dialog' : 'region');
    if (position === 'drawer') trigger.setAttribute('aria-haspopup', 'dialog'); else trigger.removeAttribute('aria-haspopup');
    panel.classList.toggle('ado-files-minimized', position === 'bottom' && !opened);
    mounted.splitter.setAttribute(SETUP, position === 'drawer' && opened && pinned ? 'pinned' : position === 'bottom' && opened ? 'bottom' : 'wide');
    trigger.setAttribute('aria-expanded', String(opened));
    pin.hidden = position !== 'drawer';
    pin.textContent = pinned ? 'Unpin' : 'Pin';
    pin.setAttribute('aria-pressed', String(pinned));
    close.textContent = position === 'bottom' ? opened ? 'Minimize' : 'Expand' : 'Close';
    close.setAttribute('aria-label', position === 'bottom' ? `${opened ? 'Minimize' : 'Expand'} file panel` : 'Close file navigation');
    if (nativeNavigation && opened) {
      mounted.splitter.style.setProperty('--ado-files-native-top', `${panel.offsetTop + heading.offsetHeight + nativeHelp.offsetHeight}px`);
      mounted.splitter.style.setProperty('--ado-files-native-width', `${panel.clientWidth}px`);
    }
    resizeEditor(mounted.editor, mounted.source);
    if (notify) changed();
  }
  function failAction(text: string) {
    message = text;
    feedback.textContent = text;
    console.error('[ADOverride] Files navigation unavailable.', text);
    changed();
  }
  function renderList() {
    if (nativeNavigation) {
      list.replaceChildren();
      listSignature = '';
      return;
    }
    const query = search.value.trim().toLocaleLowerCase();
    const remaining = entries.filter(entry => !entry.reviewed).length;
    count.textContent = `Changed files (${entries.length})`;
    all.textContent = `All ${entries.length}`;
    unreviewed.textContent = `Unreviewed ${remaining}`;
    all.setAttribute('aria-pressed', String(filter === 'all'));
    unreviewed.setAttribute('aria-pressed', String(filter === 'unreviewed'));
    const shown = entries.filter(entry => (filter === 'all' || !entry.reviewed) && entry.path.toLocaleLowerCase().includes(query));
    const signature = JSON.stringify([position, query, filter, shown.map(entry => [entry.path, entry.reviewed, entry.selected])]);
    if (signature === listSignature) return;
    listSignature = signature;
    const activeElement = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const active = activeElement?.dataset.path;
    const activeCheckbox = activeElement?.getAttribute('role') === 'checkbox';
    const scroll = list.scrollTop;
    list.replaceChildren();
    let folder: string | null = null;
    for (const entry of shown) {
      if (position === 'drawer' && folder !== entry.folder) {
        folder = entry.folder;
        list.append(make('div', 'ado-files-folder', folder || 'Repository root'));
      }
      const item = make('div', 'ado-files-entry');
      item.setAttribute('data-selected', String(entry.selected));
      const row = button('ado-files-file-button', '', () => {
        const current = entries.find(item => item.path === entry.path);
        if (!current?.row.isConnected || !current.target.isConnected) { failAction('The file list changed. Reopen Files before choosing a file.'); return; }
        current.target.click();
        if (position === 'drawer' && !pinned) opened = false;
        applyLayout();
        if (!opened) trigger.focus({ preventScroll: true });
      });
      row.dataset.path = entry.path;
      row.setAttribute('aria-current', String(entry.selected));
      row.setAttribute('aria-label', `${entry.path}, ${entry.reviewed ? 'reviewed' : 'unreviewed'}`);
      const state = button('ado-files-check', entry.reviewed ? '\u2713' : '\u25cb', () => {
        const current = entries.find(file => file.path === entry.path);
        if (!current?.checkbox.isConnected) { failAction('The review control changed. Reopen Files before marking a file.'); return; }
        current.checkbox.click();
        changed();
      });
      state.setAttribute('role', 'checkbox');
      state.dataset.path = entry.path;
      state.setAttribute('aria-label', `Mark ${entry.path} as reviewed`);
      state.setAttribute('aria-checked', String(entry.reviewed));
      const label = make('span', 'ado-files-name', entry.name);
      if (position === 'bottom') label.append(make('small', '', entry.folder || 'Repository root'));
      row.append(label); item.append(state, row); list.append(item);
      if (entry.path === active) (activeCheckbox ? state : row).focus({ preventScroll: true });
    }
    if (!shown.length) list.append(make('div', 'ado-files-empty', 'No matching files.'));
    if (active && !shown.some(entry => entry.path === active)) search.focus({ preventScroll: true });
    list.scrollTop = scroll;
  }
  function clear() {
    if (mounted) {
      mounted.root.removeAttribute(ROOT);
      mounted.root.removeAttribute(NAVIGATION);
      mounted.source.removeAttribute(SOURCE); mounted.source.removeAttribute('inert');
      if (sourceAttributes) {
        for (const [name, value] of Object.entries(sourceAttributes)) {
          if (value === null) mounted.source.removeAttribute(name);
          else mounted.source.setAttribute(name, value);
        }
      }
      mounted.toolbar.removeAttribute(TOOLBAR); mounted.splitter.removeAttribute(SETUP);
      mounted.splitter.style.removeProperty('--ado-files-native-top');
      mounted.splitter.style.removeProperty('--ado-files-native-width');
    }
    controls.remove(); panel.remove(); style.remove(); notice.remove();
    if (mounted) resizeEditor(mounted.editor, mounted.source);
    viewSizes = ''; sourceAttributes = null; nativeNavigation = false;
    mounted = null; entries = []; listSignature = ''; message = null; feedback.textContent = '';
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !mounted || !opened || position === 'drawer' && pinned ||
      event.defaultPrevented || !(event.target instanceof Node) ||
      !panel.contains(event.target) && !(nativeNavigation && mounted.source.contains(event.target))) return;
    opened = false; applyLayout(); trigger.focus({ preventScroll: true }); event.stopPropagation();
  };
  document.addEventListener('keydown', escape);
  const nativeClick = (event: MouseEvent) => {
    if (!mounted || !nativeNavigation || position !== 'drawer' || pinned || !opened ||
      !(event.target instanceof Element) || !mounted.source.contains(event.target)) return;
    const label = event.target.closest('.bolt-tree-cell .text-ellipsis');
    const row = label?.closest('tr[role="row"][aria-level]');
    if (!row || row.hasAttribute('aria-expanded') || row.querySelector('.repos-file-explorer-tree-thread-item')) return;
    const source = mounted.source;
    queueMicrotask(() => {
      if (mounted?.source !== source || !nativeNavigation || pinned) return;
      opened = false; applyLayout(); trigger.focus({ preventScroll: true });
    });
  };
  document.addEventListener('click', nativeClick, true);
  return {
    update(root: HTMLElement | null, pageKey: string, selected: PrFilesPosition): FilesResult {
      if (!root) { clear(); return { applied: false, message: null }; }
      const next = surface(root);
      if (!next) { clear(); return { applied: false, message: 'Wide Files layout is unavailable on this page. The native file tree is kept.' }; }
      const mapped = readFileEntries(next.tree);
      if (next.source.hasAttribute('inert') && !next.source.hasAttribute(SOURCE)) {
        clear();
        notice.textContent = 'Wide Files layout is unavailable while the native file tree is inactive.';
        next.toolbar.after(notice);
        return { applied: false, message: notice.textContent };
      }
      if (mounted?.root !== root || mounted.splitter !== next.splitter || mounted.source !== next.source || mounted.editor !== next.editor) {
        clear(); mounted = next;
        sourceAttributes = { id: next.source.getAttribute('id'), tabindex: next.source.getAttribute('tabindex') };
      }
      else mounted = next;
      if (key !== pageKey || position !== selected) {
        if (key !== pageKey) { search.value = ''; filter = 'all'; nativeNavigation = false; }
        key = pageKey; position = selected; opened = selected === 'bottom'; pinned = false;
      }
      // Keep native navigation for this page so filtering or virtual rerenders cannot swap it mid-use.
      const changedNavigation = !nativeNavigation && !mapped;
      const focusedCustomContent = content.contains(document.activeElement);
      nativeNavigation ||= !mapped;
      entries = nativeNavigation ? [] : mapped ?? [];
      if (!style.isConnected) document.head.append(style);
      if (controls.parentElement !== next.toolbar) next.toolbar.prepend(controls);
      if (panel.parentElement !== next.splitter) next.splitter.append(panel);
      applyLayout(false);
      renderList();
      if (changedNavigation && focusedCustomContent && opened) focusNavigation();
      return { applied: true, message };
    },
    clear,
    dispose() { clear(); document.removeEventListener('keydown', escape); document.removeEventListener('click', nativeClick, true); },
  };
}
