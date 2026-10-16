import { emptyPrSnapshot, parsePullRequest, type PrFeature, type PrFilterState, type PrProfile, type PrSnapshot } from './pr';
import type { Preferences } from './preferences';
import { rendered } from './ticket';

const ROOT = 'data-ado-pr';
const ROW = 'data-ado-pr-row';
const STATUS = 'data-ado-pr-status';
const PLACED = 'data-ado-pr-placed';
const PASSED = 'data-ado-pr-passed';
const SILENT = 'data-ado-pr-silent';
const ORDER = 'data-ado-pr-order';
const OPEN = 'data-ado-pr-open';
const UI = 'data-ado-pr-ui';
const STYLE = 'data-ado-pr-style';
const OWNED = [ROOT, ROW, STATUS, PLACED, PASSED, SILENT, ORDER, OPEN];

const levels = Array.from({ length: 16 }, (_, index) => index + 1);
export const PR_CSS = `
[${ROOT}~="compact-header"]>.repos-pr-header{padding-top:8px!important;margin-bottom:0!important;}
[${ROOT}~="compact-header"]>.repos-pr-header .pr-secondary-title-row{margin-top:0!important;}
[${ROOT}~="compact-header"]>.repos-pr-details-page-tabbar,[${ROOT}~="compact-header"]>.repos-pr-details-page-tabbar .bolt-tabbar-tabs,
[${ROOT}~="compact-header"]>.repos-pr-details-page-tabbar .bolt-tab{height:40px!important;min-height:40px!important;}
[${ROOT}~="compact-header"]>.page-content.page-content-top{padding-top:8px!important;}
[${ROOT}~="compact-header"] .repos-compare-toolbar{padding-top:6px!important;padding-bottom:6px!important;}
[${ROOT}~="rail"] [${ROW}]{position:relative!important;}
[${ROOT}~="rail"] [${STATUS}][${PLACED}]{position:absolute!important;top:0;right:0;width:var(--ado-pr-rail-width,340px)!important;margin:0!important;z-index:1;}
[${ROOT}~="rail"] [${STATUS}][${PLACED}] .padding-horizontal-20{padding-left:14px!important;padding-right:14px!important;}
[${ROOT}~="rail"] [${STATUS}][${PLACED}] .padding-vertical-16{padding-top:10px!important;padding-bottom:10px!important;}
[${ROOT}~="rail"] [${STATUS}][${PLACED}]+*{margin-top:0!important;}
[${ROOT}~="rail"] [${STATUS}][${PLACED}] .proof-of-presence-container>.flex-row{flex-wrap:wrap;row-gap:8px;}
[${ROOT}~="rail"] [${STATUS}][${PLACED}] .proof-of-presence-container>.flex-row>.bolt-expandable-button{margin-left:40px!important;}
[${ROOT}~="rail"] [${ROW}]>.repos-overview-right-pane{padding-top:calc(var(--ado-pr-status-height,0px) + 20px)!important;}
[${ROOT}~="rail"] [${ORDER}="workitems"]{order:1;}
[${ROOT}~="rail"] [${ORDER}="tags"]{order:2;}
[${ROOT}~="passed"] [${STATUS}]:not([${OPEN}]) [${PASSED}]{display:none!important;}
[${ROOT}~="reviewers"] .pr-optional-reviewers-section:not([${OPEN}])>[${SILENT}]{display:none!important;}
[${ROOT}~="tree-comments"] .repos-changes-explorer-tree tr.bolt-tree-row:has(.repos-file-explorer-tree-thread-item){display:none!important;}
[${ROOT}~="compact-tree"] .repos-changes-explorer-tree .bolt-tree-cell .padding-vertical-8{padding-top:4px!important;padding-bottom:4px!important;}
${levels.map(level => `[${ROOT}~="compact-tree"] .repos-changes-explorer-tree tr[aria-level="${level}"] .bolt-tree-expand-button{margin-left:${(level - 1) * 8}px!important;}`).join('\n')}
[${UI}]{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;margin:6px 12px;padding:2px 8px;border:1px solid transparent;border-radius:4px;
  background:transparent;color:var(--communication-foreground,#0078d4);font:inherit;font-size:13px;line-height:20px;cursor:pointer;}
[${UI}]:hover{border-color:currentColor;}
[${UI}]:focus-visible{outline:2px solid var(--focus-border-color,#0078d4);outline-offset:1px;}
`;

const TOKENS: Record<PrFeature, string> = {
  compactHeader: 'compact-header', railStatus: 'rail', hidePassedChecks: 'passed', collapseReviewers: 'reviewers',
  activeComments: '', hideTreeComments: 'tree-comments', compactTree: 'compact-tree',
};
const OVERVIEW: PrFeature[] = ['railStatus', 'hidePassedChecks', 'collapseReviewers', 'activeComments'];
const FILES: PrFeature[] = ['hideTreeComments', 'compactTree'];

function setAttribute(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
function sleep(ms: number) { return new Promise(resolve => window.setTimeout(resolve, ms)); }
function labelText(element: Element | null | undefined) { return element?.textContent?.replace(/\(\d+\)/g, '').trim().toLowerCase() ?? ''; }

export function statusSections(card: Element): { section: HTMLElement; state: string }[] | null {
  const column = card.querySelector(':scope > .bolt-card-content > .flex-column');
  if (!column) return null;
  const sections: { section: HTMLElement; state: string }[] = [];
  for (const section of column.children) {
    if (!(section instanceof HTMLElement) || section.hasAttribute(UI)) continue;
    const icon = section.querySelector(':scope > svg.bolt-status, :scope > .flex-row > svg.bolt-status');
    if (!icon) return null;
    const state = ['failed', 'active', 'success', 'neutral', 'warning'].find(name => icon.classList.contains(name)) ?? 'unknown';
    sections.push({ section, state });
  }
  return sections.length ? sections : null;
}

export function createPrController(document: Document, address: () => string) {
  let preferences: Preferences | null = null;
  let snapshot = emptyPrSnapshot();
  let settingsError: string | null = null;
  let disposed = false;
  let scheduled = 0;
  const listeners = new Set<(value: PrSnapshot) => void>();
  const marked = new Set<Element>();
  const buttons = new Map<string, HTMLButtonElement>();
  const opened = new Set<string>();
  const filters = new Map<string, PrFilterState>();
  const touched = new Set<string>();
  let filterBusy = false;
  const style = document.createElement('style');
  style.setAttribute(STYLE, '');
  style.textContent = PR_CSS;
  const resize = new ResizeObserver(() => schedule());
  let resized: Element | null = null;

  function publish(value: PrSnapshot) {
    if (JSON.stringify(value) === JSON.stringify(snapshot)) return;
    snapshot = value;
    for (const listener of listeners) listener(value);
  }
  function sync(desired = new Map<Element, Map<string, string>>()) {
    for (const [element, attributes] of desired) {
      for (const [name, value] of attributes) setAttribute(element, name, value);
      marked.add(element);
    }
    for (const element of marked) {
      const attributes = desired.get(element);
      for (const name of OWNED) if (!attributes?.has(name)) element.removeAttribute(name);
      if (!attributes?.has(ROW) && element instanceof HTMLElement) {
        element.style.removeProperty('--ado-pr-status-height');
        element.style.removeProperty('--ado-pr-rail-width');
      }
      if (!attributes) marked.delete(element);
    }
  }
  function removeButtons(keep = new Set<string>()) {
    for (const [id, button] of buttons) if (!keep.has(id)) { button.remove(); buttons.delete(id); }
  }
  function reset() {
    sync(); removeButtons(); style.remove();
    if (resized) { resize.unobserve(resized); resized = null; }
  }
  function button(id: string, parent: Element, text: string, expanded: boolean, toggle: () => void) {
    let element = buttons.get(id);
    if (!element) {
      element = document.createElement('button');
      element.type = 'button';
      element.setAttribute(UI, id);
      element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); toggle(); });
      buttons.set(id, element);
    }
    if (element.textContent !== text) element.textContent = text;
    setAttribute(element, 'aria-expanded', String(expanded));
    if (element.parentElement !== parent || parent.lastElementChild !== element) parent.append(element);
    return element;
  }
  function toggle(key: string) {
    if (opened.has(key)) opened.delete(key); else opened.add(key);
    schedule();
  }

  async function applyFilter(key: string, dropdown: HTMLElement) {
    filterBusy = true;
    try {
      const page = dropdown.closest('.repos-pr-details-page');
      const scroll = page?.scrollTop ?? 0;
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const trigger = dropdown.querySelector<HTMLButtonElement>('button');
      if (!trigger) { filters.set(key, 'unavailable'); return; }
      const options = () => [...document.querySelectorAll<HTMLElement>('.bolt-callout [role="option"]')].filter(rendered);
      const close = async () => {
        if (!options().length) return;
        trigger.click();
        for (let i = 0; i < 20 && options().length; i++) await sleep(25);
      };
      trigger.click();
      let target: HTMLElement | undefined;
      for (let i = 0; i < 40 && !target; i++) {
        await sleep(50);
        if (disposed || touched.has(key)) { await close(); return; }
        target = options().find(option => option.id.endsWith('active_comments'));
      }
      const selected = options().find(option => option.getAttribute('aria-selected') === 'true');
      if (!target || !selected) { await close(); filters.set(key, 'unavailable'); }
      else if (!selected.id.endsWith('everything')) { await close(); filters.set(key, 'kept'); }
      else {
        const expected = labelText(target);
        target.click();
        for (let i = 0; i < 20 && options().length; i++) await sleep(25);
        filters.set(key, labelText(trigger) === expected ? 'applied' : 'unavailable');
      }
      // ADO moves focus back to the trigger after its own async update; wait for that before restoring.
      await sleep(100);
      if (page && page.scrollTop !== scroll) page.scrollTop = scroll;
      if (focused && focused !== trigger && focused !== document.body && focused.isConnected) focused.focus({ preventScroll: true });
      else if (document.activeElement === trigger) trigger.blur();
    } catch (reason) {
      console.error('[ADOverride] Could not select the native activity filter.', reason);
      filters.set(key, 'unavailable');
    } finally {
      filterBusy = false;
      schedule();
    }
  }

  function reconcile() {
    scheduled = 0;
    if (disposed) return;
    try {
      if (settingsError) { reset(); publish({ ...emptyPrSnapshot(), status: 'error', message: settingsError }); return; }
      const pr = parsePullRequest(address());
      const roots = pr ? [...document.querySelectorAll<HTMLElement>('.repos-pr-details-page')].filter(rendered) : [];
      const root = roots.length === 1 ? roots[0] : undefined;
      if (!pr || !root || !preferences) {
        reset();
        publish({ ...emptyPrSnapshot(), view: pr?.view ?? null,
          ...(roots.length > 1 ? { status: 'error', message: 'Several pull request pages are visible. The native layout is kept.' } : {}) });
        return;
      }
      if (!preferences.enabled) { reset(); publish({ ...emptyPrSnapshot(), status: 'paused', view: pr.view }); return; }
      const profile: PrProfile = preferences.pr;
      const desired = new Map<Element, Map<string, string>>();
      const keepButtons = new Set<string>();
      const tokens: string[] = [];
      const applied: PrFeature[] = [];
      const unsupported: PrFeature[] = [];
      let passedChecks = 0;
      let silentReviewers = 0;
      let treeComments = 0;
      const mark = (element: Element, name: string, value = '') => {
        const attributes = desired.get(element) ?? new Map<string, string>();
        attributes.set(name, value); desired.set(element, attributes);
      };

      if (profile.compactHeader) {
        if (root.querySelector(':scope > .repos-pr-header')) { tokens.push(TOKENS.compactHeader); applied.push('compactHeader'); }
        else unsupported.push('compactHeader');
      }
      if (pr.view === 'overview') {
        const row = root.querySelector<HTMLElement>(':scope > .page-content > .flex-row');
        const left = row?.children[0];
        const rail = row?.querySelector<HTMLElement>(':scope > .repos-overview-right-pane');
        const card = left?.firstElementChild?.matches('.bolt-table-card') ? left.firstElementChild as HTMLElement : null;
        const sections = card ? statusSections(card) : null;
        const status = sections ? card : null;
        if (status) mark(status, STATUS);
        if (profile.railStatus) {
          const railBounds = rail && rendered(rail) ? rail.getBoundingClientRect() : null;
          const leftBounds = left?.getBoundingClientRect();
          const sideBySide = railBounds && leftBounds && railBounds.left >= leftBounds.right - 1;
          if (row && rail && status && sideBySide) {
            mark(row, ROW); mark(status, PLACED); tokens.push(TOKENS.railStatus); applied.push('railStatus');
            const height = `${Math.ceil(status.getBoundingClientRect().height)}px`;
            const width = `${Math.round(railBounds.width)}px`;
            if (row.style.getPropertyValue('--ado-pr-status-height') !== height) row.style.setProperty('--ado-pr-status-height', height);
            if (row.style.getPropertyValue('--ado-pr-rail-width') !== width) row.style.setProperty('--ado-pr-rail-width', width);
            if (resized !== status) { if (resized) resize.unobserve(resized); resize.observe(status); resized = status; }
            const blocks = [...rail.children];
            const tags = blocks.find((block, index) => index > 0 && block.matches('.flex-column.rhythm-vertical-8') && !block.matches('.region-pullRequestDetailsOverviewExtensions'));
            const items = blocks.find(block => block.matches('.region-pullRequestDetailsOverviewExtensions'));
            if (tags && items) { mark(tags, ORDER, 'tags'); mark(items, ORDER, 'workitems'); }
          } else unsupported.push('railStatus');
        }
        if (profile.hidePassedChecks) {
          if (status && sections) {
            const passed = sections.filter(item => item.state === 'success');
            passedChecks = passed.length;
            for (const { section } of passed) mark(section, PASSED);
            tokens.push(TOKENS.hidePassedChecks); applied.push('hidePassedChecks');
            const id = `${pr.key}:passed`;
            const open = opened.has(id);
            if (open) mark(status, OPEN);
            const column = sections[0]?.section.parentElement;
            if (passed.length && column) {
              keepButtons.add('passed');
              button('passed', column, open ? `Hide ${passed.length} passed` : `${passed.length} passed`, open, () => toggle(id));
            }
          } else unsupported.push('hidePassedChecks');
        }
        if (profile.collapseReviewers) {
          const optional = rail?.querySelector<HTMLElement>('.pr-optional-reviewers-section');
          const required = rail?.querySelector('.pr-required-reviewers-section');
          if (optional || required) {
            tokens.push(TOKENS.collapseReviewers); applied.push('collapseReviewers');
            const silent = optional ? [...optional.querySelectorAll<HTMLElement>(':scope > .repos-reviewer')]
              .filter(row => row.querySelector('svg.repos-reviewer-vote-icon')?.classList.contains('neutral')) : [];
            silentReviewers = silent.length;
            for (const row of silent) mark(row, SILENT);
            const id = `${pr.key}:reviewers`;
            const open = opened.has(id);
            if (optional && open) mark(optional, OPEN);
            if (optional && silent.length) {
              keepButtons.add('reviewers');
              button('reviewers', optional, open ? `Hide ${silent.length} with no vote` : `+${silent.length} with no vote`, open, () => toggle(id));
            }
          } else unsupported.push('collapseReviewers');
        }
        if (profile.activeComments) {
          const dropdown = root.querySelector<HTMLElement>('.repos-activity-filter-dropdown');
          const ready = dropdown && rendered(dropdown) && root.querySelector('table.activity-feed-list');
          if (!filters.has(pr.key) && touched.has(pr.key)) filters.set(pr.key, 'kept');
          if (!filters.has(pr.key) && ready && !filterBusy) { filters.set(pr.key, 'waiting'); void applyFilter(pr.key, dropdown); }
          applied.push('activeComments');
        }
      } else if (pr.view === 'files') {
        const tree = root.querySelector('.repos-changes-explorer-tree');
        treeComments = tree ? tree.querySelectorAll('tr.bolt-tree-row .repos-file-explorer-tree-thread-item').length : 0;
        for (const feature of FILES) if (profile[feature]) {
          if (tree) { tokens.push(TOKENS[feature]); applied.push(feature); } else unsupported.push(feature);
        }
      }
      if (tokens.length) {
        mark(root, ROOT, tokens.join(' '));
        if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      } else style.remove();
      sync(desired);
      removeButtons(keepButtons);
      if (resized && !desired.get(resized)?.has(PLACED)) { resize.unobserve(resized); resized = null; }
      const filter = profile.activeComments && pr.view === 'overview' ? filters.get(pr.key) ?? 'waiting' : 'off';
      const relevant = pr.view === 'overview' ? ['compactHeader', ...OVERVIEW] : pr.view === 'files' ? ['compactHeader', ...FILES] : ['compactHeader'];
      const missing = unsupported.filter(feature => relevant.includes(feature));
      publish({ version: 1, status: applied.length ? 'active' : 'original', view: pr.view, applied, unsupported: missing,
        passedChecks, silentReviewers, treeComments, filter,
        message: missing.length ? 'Some parts of this page were not recognized and keep the native layout.' : null });
    } catch (reason) {
      reset();
      console.error('[ADOverride] Could not customize the pull request page.', reason);
      publish({ ...emptyPrSnapshot(), status: 'error', message: reason instanceof Error ? reason.message : 'Could not customize the pull request page.' });
    }
  }
  function schedule() { if (!disposed && !scheduled) scheduled = window.requestAnimationFrame(reconcile); }

  const observer = new MutationObserver(changes => {
    if (!parsePullRequest(address())) return;
    if (changes.some(change => {
      const target = change.target instanceof Element ? change.target : change.target.parentElement;
      if (target?.closest(`[${UI}],[${STYLE}]`)) return false;
      if (change.type === 'attributes') return !change.attributeName?.startsWith('data-ado-');
      return [...change.addedNodes, ...change.removedNodes].some(node => !(node instanceof Element && (node.hasAttribute(UI) || node.hasAttribute(STYLE))));
    })) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-hidden', 'aria-selected', 'aria-expanded'] });
  resize.observe(document.documentElement);
  const interaction = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof Element) || !event.target.closest('.repos-activity-filter-dropdown')) return;
    const pr = parsePullRequest(address());
    if (pr) touched.add(pr.key);
  };
  document.addEventListener('pointerdown', interaction, true);
  document.addEventListener('keydown', interaction, true);

  return {
    get snapshot() { return snapshot; },
    setPreferences(value: Preferences) {
      if (preferences && value.revision < preferences.revision) return;
      preferences = value; settingsError = null; reconcile();
    },
    failSettings(message: string) { preferences = null; settingsError = message; reset(); publish({ ...emptyPrSnapshot(), status: 'error', message }); },
    subscribe(listener: (value: PrSnapshot) => void) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    refresh: schedule,
    dispose() {
      disposed = true; observer.disconnect(); resize.disconnect();
      if (scheduled) window.cancelAnimationFrame(scheduled);
      document.removeEventListener('pointerdown', interaction, true);
      document.removeEventListener('keydown', interaction, true);
      reset(); listeners.clear();
    },
  };
}
