import { emptyBoardSnapshot, type BoardSnapshot } from './board';
import { parseAdoContext } from './context';
import { effectiveBoardView, type Preferences } from './preferences';
import { rendered } from './ticket';
import { createBoardAutoLoader } from './board-auto-load';
import { createBoardPresentation } from './board-presentation';

const ROOT = 'data-ado-board-root';
const COLUMN = 'data-ado-board-expanded';
const css = `[${ROOT}] [${COLUMN}]{max-width:none!important;}`;

export function createBoardController(document: Document, address: () => string) {
  let preferences: Preferences | null = null;
  let snapshot = emptyBoardSnapshot();
  let disposed = false;
  let scheduled = 0;
  let settingsError: string | null = null;
  const marked = new Set<HTMLElement>();
  const listeners = new Set<(value: BoardSnapshot) => void>();
  const style = document.createElement('style');
  style.setAttribute('data-ado-board-style', '');
  style.textContent = css;
  const autoLoader = createBoardAutoLoader(document, () => schedule());
  const presentation = createBoardPresentation(document);
  const stopAuto = () => {
    autoLoader.update({ root: null, columns: [], collapsed: new Set(), enabled: false, paused: false, key: '' });
    presentation.apply(null, null);
  };
  function publish(value: BoardSnapshot) {
    if (JSON.stringify(value) === JSON.stringify(snapshot)) return;
    snapshot = value;
    for (const listener of listeners) listener(value);
  }
  function clear(keep = new Set<HTMLElement>()) {
    for (const element of marked) if (!keep.has(element)) {
      element.removeAttribute(ROOT); element.removeAttribute(COLUMN); marked.delete(element);
    }
    if (!keep.size) style.remove();
  }
  function reconcile() {
    scheduled = 0;
    if (disposed) return;
    try {
      if (settingsError) { clear(); stopAuto(); publish({ ...emptyBoardSnapshot(), status: 'error', message: settingsError }); return; }
      const context = parseAdoContext(address());
      const roots = context?.pageKind === 'board' ? [...document.querySelectorAll<HTMLElement>('.kanban-board')]
        .filter(element => !element.closest('.work-item-form-page,.work-item-form-dialog') && rendered(element)) : [];
      const root = roots.length === 1 ? roots[0] : null;
      if (!root) {
        clear(); stopAuto();
        publish({ ...emptyBoardSnapshot(), ...(roots.length > 1 ? { status: 'unsupported', message: 'Multiple native Boards are visible. Original widths are retained.' } : {}) });
        return;
      }
      const headers = [...root.querySelectorAll<HTMLElement>(':scope > .kanban-board-column-header-container')];
      const bodies = [...root.querySelectorAll<HTMLElement>(':scope > .kanban-board-content')];
      const header = headers.length === 1 ? headers[0] : null;
      const body = bodies.length === 1 ? bodies[0] : null;
      const headerColumns = header ? [...header.children].filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element.matches('.kanban-board-column-header')) : [];
      const columns = body ? [...body.children].filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element.matches('.kanban-board-column')) : [];
      const safe = header && body && headerColumns.length > 0 && columns.length === headerColumns.length &&
        headerColumns.length === header.children.length && columns.length === body.children.length &&
        root.querySelectorAll('.kanban-board-column-header').length === headerColumns.length &&
        root.querySelectorAll('.kanban-board-column').length === columns.length;
      if (!safe) {
        clear(); stopAuto();
        publish({ ...emptyBoardSnapshot(), status: 'unsupported', message: 'This Board has an unsupported column, split-column or swimlane structure. Original widths are retained.' });
        return;
      }
      const profile = preferences ? effectiveBoardView(preferences, context).board : null;
      const paused = [...document.querySelectorAll('.work-item-form-dialog,.work-item-form-page,[role="dialog"],[aria-modal="true"]')].some(rendered);
      const collapsed = headerColumns.map(column => column.querySelector('.kanban-board-column-collapse-button')?.getAttribute('aria-expanded') === 'false');
      const appliedPresentation = presentation.apply(root, preferences?.enabled ? profile : null);
      const enabled = Boolean(preferences?.enabled && profile?.equalColumns);
      const count = collapsed.filter(Boolean).length;
      const applying = enabled && columns.length > count;
      const keep = new Set<HTMLElement>();
      if (applying) {
        keep.add(root); root.setAttribute(ROOT, '');
        for (const [index, column] of columns.entries()) if (!collapsed[index]) {
          const heading = headerColumns[index];
          if (!heading) throw new Error('Native Board header mapping changed.');
          for (const element of [heading, column]) {
            keep.add(element); element.setAttribute(COLUMN, '');
          }
        }
        if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      }
      clear(keep);
      for (const element of keep) marked.add(element);
      if (applying) {
        const widths: number[] = [];
        const aligned = columns.every((column, index) => {
          const heading = headerColumns[index]?.getBoundingClientRect();
          const bounds = column.getBoundingClientRect();
          if (!heading || Math.abs(heading.x - bounds.x) > 1 || Math.abs(heading.width - bounds.width) > 1) return false;
          if (!collapsed[index] && bounds.width > 0) widths.push(bounds.width);
          return true;
        });
        if (!aligned || widths.length > 1 && Math.max(...widths) - Math.min(...widths) > 1) {
          clear(); stopAuto();
          publish({ ...emptyBoardSnapshot(), status: 'unsupported',
            message: 'Native column sizing cannot be aligned safely. Original Board widths are retained.' });
          return;
        }
      }
      const bounds = body.getBoundingClientRect();
      const last = columns.at(-1)?.getBoundingClientRect();
      autoLoader.update({ root, columns, collapsed: new Set(columns.filter((_, index) => collapsed[index])),
        enabled: Boolean(preferences?.enabled && profile?.autoLoadItems),
        paused, key: address() });
      const autoLoad = autoLoader.snapshot;
      const effective = applying || appliedPresentation.compactCards || appliedPresentation.compactHeader || appliedPresentation.hiddenFields > 0 ||
        Boolean(preferences?.enabled && profile?.autoLoadItems &&
        autoLoad.status !== 'off' && autoLoad.status !== 'paused' && autoLoad.status !== 'error');
      publish({ version: 4, status: !preferences?.enabled ? 'paused' : effective ? 'active' : 'original',
        effective, columns: columns.length, expanded: columns.length - count, collapsed: count,
        availableWidth: Math.round(bounds.width * 100) / 100,
        trailingSpace: Math.max(0, Math.round((bounds.right - (last?.right ?? bounds.right)) * 100) / 100),
        message: appliedPresentation.message, equalColumns: applying, autoLoad, presentation: appliedPresentation });
    } catch (reason) {
      clear(); stopAuto();
      console.error('[ADO Customize] Could not customize Board widths.', reason);
      publish({ ...emptyBoardSnapshot(), status: 'error', message: reason instanceof Error ? reason.message : 'Could not customize Board widths.' });
    }
  }
  function schedule() { if (!disposed && !scheduled) scheduled = window.requestAnimationFrame(reconcile); }
  const observer = new MutationObserver(changes => {
    if (changes.some(change => {
      const element = change.target instanceof Element ? change.target : change.target.parentElement;
      if (element?.matches('.work-item-form-page,.work-item-form-dialog,[role="dialog"],[aria-modal="true"]')) return true;
      if (element?.closest('.wit-card,.boards-card')) {
        const field = element.closest('.field-container');
        if (field?.firstElementChild?.contains(element)) return true;
        return change.type === 'childList' && [...change.addedNodes, ...change.removedNodes].some(node => node instanceof Element);
      }
      if (element?.closest('.wit-card,.boards-card,.work-item-form-page,.work-item-form-dialog,[data-ado-ticket-ui],[data-ado-ticket-style],[data-ado-board-style]')) return false;
      if (change.type === 'attributes') return !change.attributeName?.startsWith('data-ado-');
      if (change.type === 'characterData') return Boolean(element?.closest('.kanban-board-column-header,.bolt-tab-text'));
      return [...change.addedNodes, ...change.removedNodes].some(node =>
        !(node instanceof Element && (node.hasAttribute('data-ado-board-style') || node.hasAttribute('data-ado-ticket-ui') || node.hasAttribute('data-ado-ticket-style'))));
    })) schedule();
  });
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-disabled', 'aria-hidden', 'aria-expanded', 'aria-selected', 'role', 'aria-modal'] });
  const resize = new ResizeObserver(schedule);
  resize.observe(document.documentElement);
  const focusChange = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('.kanban-board,.bolt-header,.vss-FilterBar')) schedule();
  };
  document.addEventListener('focusin', focusChange);
  document.addEventListener('focusout', focusChange);
  return {
    get snapshot() { return snapshot; },
    setPreferences(value: Preferences) {
      if (preferences && value.revision < preferences.revision) return;
      preferences = value; settingsError = null; reconcile();
    },
    failSettings(message: string) { preferences = null; settingsError = message; clear(); stopAuto(); publish({ ...emptyBoardSnapshot(), status: 'error', message }); },
    subscribe(listener: (value: BoardSnapshot) => void) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    refresh: schedule,
    retryAutoLoad() { autoLoader.retry(); schedule(); },
    dispose() {
      disposed = true; observer.disconnect(); resize.disconnect();
      if (scheduled) window.cancelAnimationFrame(scheduled);
      autoLoader.dispose(); presentation.dispose(); clear(); listeners.clear();
      document.removeEventListener('focusin', focusChange);
      document.removeEventListener('focusout', focusChange);
    },
  };
}
