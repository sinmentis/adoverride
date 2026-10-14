import { ID_MARKERS, ticketId } from './inspector';
import { isObject, rendered } from './ticket';
import { captureTicketScroll, restoreTicketScroll } from './ticket-scroll';
import { observeBoardInteraction } from './board-interaction';

export const AUTO_LOAD_TIMEOUT = 30000;
const SETTLE_DELAY = 200;
const CARDS = '.wit-card,.boards-card';
const INTERACTIVE = 'button,a,[role="button"],[role="link"]';
const EXCLUDED = `${CARDS},.work-item-form-page,.work-item-form-dialog,[data-ado-ticket-ui],input,textarea,iframe,[contenteditable]`;
export type AutoLoadStatus = 'off' | 'loading' | 'waiting' | 'complete' | 'paused' | 'error';
export interface AutoLoadSnapshot {
  status: AutoLoadStatus;
  batches: number;
  remaining: number;
  itemsSeen: number;
  message: string | null;
}
export const emptyAutoLoadSnapshot = (): AutoLoadSnapshot => ({
  status: 'off', batches: 0, remaining: 0, itemsSeen: 0, message: null,
});
export function decodeAutoLoadSnapshot(value: unknown): AutoLoadSnapshot {
  if (!isObject(value) || value.status !== 'off' && value.status !== 'loading' && value.status !== 'waiting' &&
    value.status !== 'complete' && value.status !== 'paused' && value.status !== 'error' ||
    !isObject(value) || typeof value.batches !== 'number' || typeof value.remaining !== 'number' ||
    typeof value.itemsSeen !== 'number' || value.message !== null && typeof value.message !== 'string') {
    throw new Error('Invalid Board auto-loading status.');
  }
  if ([value.batches, value.remaining, value.itemsSeen].some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Invalid Board auto-loading counts.');
  }
  return { status: value.status, batches: value.batches, remaining: value.remaining, itemsSeen: value.itemsSeen, message: value.message };
}
interface LoadContext {
  root: HTMLElement | null;
  columns: HTMLElement[];
  collapsed: ReadonlySet<HTMLElement>;
  enabled: boolean;
  paused: boolean;
  key: string;
}
interface Progress { count: number; ids: Set<string> }
interface PendingLoad { index: number; baseline: Progress; started: number; control: HTMLElement }
function progress(column: HTMLElement): Progress {
  const ids = new Set<string>();
  let unidentified = 0;
  for (const card of column.querySelectorAll(CARDS)) {
    const id = ticketId(card);
    if (id) ids.add(id); else unidentified++;
  }
  return { count: ids.size + unidentified, ids };
}
function changed(current: Progress, previous: Progress): boolean {
  return current.count !== previous.count || current.ids.size !== previous.ids.size ||
    [...current.ids].some(id => !previous.ids.has(id));
}
function loadControls(column: HTMLElement): HTMLElement[] {
  return [...column.querySelectorAll<HTMLElement>(INTERACTIVE)].filter(element => {
    if (element.closest(EXCLUDED) || element.querySelector(EXCLUDED) ||
      element.closest('.kanban-board-column') !== column || !rendered(element)) return false;
    const labels = [element.getAttribute('aria-label'), element.getAttribute('title'), element.textContent,
      ...[...element.querySelectorAll('span')].filter(span => span.childElementCount === 0).map(span => span.textContent)];
    return labels.some(label =>
      /^show more items(?:\.{3}|\u2026)?$/i.test(label?.replace(/\s+/g, ' ').trim() ?? ''));
  });
}
const busy = (element: HTMLElement) => element.matches(':disabled') ||
  Boolean(element.closest('[aria-disabled="true"],[aria-busy="true"],[inert]'));
const nativeLoading = (column: HTMLElement) => Boolean(column.closest('[aria-busy="true"]')) ||
  [...column.querySelectorAll('[role="progressbar"],[aria-busy="true"]')]
    .some(element => !element.closest(EXCLUDED) && rendered(element));

export function createBoardAutoLoader(document: Document, notify: () => void) {
  let context: LoadContext = { root: null, columns: [], collapsed: new Set(), enabled: false, paused: false, key: '' };
  let snapshot = emptyAutoLoadSnapshot();
  let pending: PendingLoad | null = null;
  let attempts = new Map<number, Progress>();
  let failure: string | null = null;
  let batches = 0;
  let cooldown = 0;
  let wake = 0;
  let wakeAt = 0;
  let deadline = 0;
  let disposed = false;
  const interaction = observeBoardInteraction(document, () => context.root, () => schedule());
  const observer = new MutationObserver(changes => {
    if (changes.some(change => {
      const element = change.target instanceof Element ? change.target : change.target.parentElement;
      if (!element?.closest(CARDS)) return true;
      if (change.type === 'attributes') return change.attributeName === 'data-work-item-id';
      return Boolean(element.matches(`.font-weight-semibold.selectable-text,${ID_MARKERS}`));
    })) schedule();
  });
  function publish(status: AutoLoadStatus, remaining: number, itemsSeen: number, message: string | null = null) {
    const value = { status, batches, remaining, itemsSeen, message };
    if (JSON.stringify(value) === JSON.stringify(snapshot)) return;
    snapshot = value; notify();
  }
  function clearPending() { pending = null; window.clearTimeout(deadline); deadline = 0; }
  function cancelWake() { window.clearTimeout(wake); wake = 0; }
  function fail(message: string, remaining: number, itemsSeen: number) {
    failure = message; clearPending(); cancelWake();
    console.error('[ADOverride] Board auto-loading stopped.', message);
    publish('error', remaining, itemsSeen, message);
  }
  function schedule(delay = 0) {
    if (disposed) return;
    const at = performance.now() + delay;
    if (wake && wakeAt <= at) return;
    cancelWake(); wakeAt = at;
    wake = window.setTimeout(() => { wake = 0; pump(); }, delay);
  }
  function pump() {
    if (disposed) return;
    try {
      const root = context.root;
      if (!context.enabled || !root?.isConnected) { clearPending(); cancelWake(); publish('off', 0, 0); return; }
      const dialog = [...document.querySelectorAll('.work-item-form-page,.work-item-form-dialog,[role="dialog"],[aria-modal="true"]')].some(rendered);
      if (context.paused || dialog || interaction.active || document.visibilityState !== 'visible' || !rendered(root) ||
        context.key !== document.location.href) {
        cancelWake(); publish('paused', snapshot.remaining, snapshot.itemsSeen, 'Auto-loading is paused while the Board is inactive or in use.');
        return;
      }
      const candidates: { index: number; control: HTMLElement }[] = [];
      let itemsSeen = 0;
      for (const [index, column] of context.columns.entries()) {
        if (!root.contains(column) || context.collapsed.has(column) || !rendered(column)) continue;
        itemsSeen += progress(column).count;
        const controls = loadControls(column);
        if (controls.length > 1) { fail('More than one native Show more items control was found in a column.', controls.length, itemsSeen); return; }
        if (controls[0]) candidates.push({ index, control: controls[0] });
      }
      if (failure) { publish('error', candidates.length, itemsSeen, failure); return; }
      if (pending) {
        const column = context.columns[pending.index];
        const offered = candidates.find(candidate => candidate.index === pending?.index);
        const advanced = !column || !root.contains(column) || changed(progress(column), pending.baseline);
        const stillBusy = pending.control.isConnected && busy(pending.control) || Boolean(offered && busy(offered.control)) ||
          Boolean(column && nativeLoading(column));
        const elapsed = performance.now() - pending.started;
        const completed = !offered && column && !context.collapsed.has(column) &&
          elapsed >= SETTLE_DELAY;
        if (!stillBusy && (advanced || completed)) { clearPending(); cooldown = performance.now() + SETTLE_DELAY; }
        else if (elapsed >= AUTO_LOAD_TIMEOUT) {
          fail('No loading progress for 30 seconds. Retry or use the native Show more items control.', candidates.length, itemsSeen);
          return;
        } else {
          publish('loading', candidates.length, itemsSeen, 'Loading more items...');
          // Browser timers can fire before the monotonic deadline.
          if (!deadline) schedule(Math.max(1, Math.ceil(AUTO_LOAD_TIMEOUT - elapsed)));
          if (!offered) schedule(SETTLE_DELAY);
          return;
        }
      }
      if (candidates.some(candidate => busy(candidate.control)) ||
        context.columns.some(column => root.contains(column) && !context.collapsed.has(column) && rendered(column) && nativeLoading(column))) {
        publish('waiting', candidates.length, itemsSeen, 'Waiting for native Board loading...'); return;
      }
      if (!candidates.length) {
        publish(context.columns.length && context.columns.every(column => context.collapsed.has(column)) ? 'paused' : 'complete', 0, itemsSeen,
          context.columns.length && context.columns.every(column => context.collapsed.has(column)) ?
            'Expand a column to load its remaining items.' : 'No more load-more controls in expanded columns.');
        return;
      }
      if (performance.now() < cooldown) { schedule(cooldown - performance.now()); return; }
      const next = candidates[0];
      if (!next) throw new Error('Native Board load-more controls changed.');
      const column = context.columns[next.index];
      if (!column) throw new Error('Native Board columns changed.');
      const baseline = progress(column);
      const previous = attempts.get(next.index);
      if (previous && !changed(baseline, previous)) {
        fail('The native load-more control returned without new items. Retry or load this batch manually.', candidates.length, itemsSeen);
        return;
      }
      attempts.set(next.index, baseline);
      pending = { index: next.index, baseline, started: performance.now(), control: next.control };
      batches++;
      deadline = window.setTimeout(() => { deadline = 0; pump(); }, AUTO_LOAD_TIMEOUT);
      publish('loading', candidates.length, itemsSeen, 'Loading more items...');
      const scroll = captureTicketScroll(root);
      const focus = document.activeElement;
      try { next.control.click(); }
      finally {
        if (context.root === root && root.isConnected) {
          if (focus instanceof HTMLElement && focus.isConnected && document.activeElement !== focus) focus.focus({ preventScroll: true });
          restoreTicketScroll(scroll);
        }
      }
      schedule(SETTLE_DELAY);
    } catch (reason) {
      console.error('[ADOverride] Could not auto-load Board items.', reason);
      fail('The native Show more items control could not be activated. Use it manually or retry.', snapshot.remaining, snapshot.itemsSeen);
    }
  }
  return {
    get snapshot() { return snapshot; },
    update(next: LoadContext) {
      if (disposed) return;
      const unchanged = next.root === context.root && next.key === context.key && next.enabled === context.enabled &&
        next.paused === context.paused && next.columns.length === context.columns.length &&
        next.columns.every((column, index) => column === context.columns[index] &&
          next.collapsed.has(column) === context.collapsed.has(column));
      if (unchanged) return;
      if (next.root !== context.root) interaction.reset();
      if (next.root !== context.root || next.key !== context.key) {
        observer.disconnect(); cancelWake(); clearPending(); attempts = new Map(); failure = null; batches = 0; cooldown = 0;
        if (next.root) observer.observe(next.root, { subtree: true, childList: true, characterData: true, attributes: true,
          attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'hidden', 'aria-hidden', 'class', 'data-work-item-id'] });
      }
      if (!next.enabled) failure = null;
      context = next; pump();
    },
    retry() { failure = null; attempts.clear(); clearPending(); cooldown = performance.now() + SETTLE_DELAY; schedule(SETTLE_DELAY); },
    dispose() {
      disposed = true; observer.disconnect(); cancelWake(); clearPending(); attempts.clear();
      interaction.dispose();
    },
  };
}
