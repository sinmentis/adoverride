import { authorKey, emptyPrSnapshot, isPrTabId, normalizeAuthor, parsePullRequest, updateRuns,
  type FeedRowKind, type PrAuthorState, type PrFeature, type PrFilterState, type PrProfile, type PrSnapshot, type PrTabState } from './pr';
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
const HIDE = 'data-ado-pr-hide';
const FOLD = 'data-ado-pr-fold';
export const DESCRIPTION_FOLD_HEIGHT = 240;
const UI = 'data-ado-pr-ui';
const STYLE = 'data-ado-pr-style';
const OWNED = [ROOT, ROW, STATUS, PLACED, PASSED, SILENT, ORDER, OPEN, HIDE, FOLD];

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
[${HIDE}]{display:none!important;}
[${FOLD}]{max-height:${DESCRIPTION_FOLD_HEIGHT}px!important;overflow:hidden!important;
  -webkit-mask-image:linear-gradient(to bottom,#000 65%,transparent);mask-image:linear-gradient(to bottom,#000 65%,transparent);}
[${UI}]{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;margin:6px 12px;padding:2px 8px;border:1px solid transparent;border-radius:4px;
  background:transparent;color:var(--communication-foreground,#0078d4);font:inherit;font-size:13px;line-height:20px;cursor:pointer;white-space:nowrap;flex-shrink:0;}
[${UI}]:hover{border-color:currentColor;}
[${UI}]:focus-visible{outline:2px solid var(--focus-border-color,#0078d4);outline-offset:1px;}
`;

const TOKENS: Record<PrFeature, string> = {
  compactHeader: 'compact-header', railStatus: 'rail', hidePassedChecks: 'passed', collapseReviewers: 'reviewers',
  activeComments: '', hideTreeComments: 'tree-comments', compactTree: 'compact-tree',
  hideHeaderReviewers: '', foldDescription: '', foldUpdates: '', compactPushes: '',
};
const EVERY_TAB: PrFeature[] = ['compactHeader', 'hideHeaderReviewers'];
const OVERVIEW: PrFeature[] = ['railStatus', 'hidePassedChecks', 'collapseReviewers', 'foldDescription', 'activeComments', 'foldUpdates', 'compactPushes'];
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

export function feedRowKind(row: Element): FeedRowKind {
  if (row.querySelector('.repos-discussion-thread, .repos-discussion-comment')) return 'comment';
  if (row.querySelector('.activity-feed-timeline-iteration')) return 'update';
  if (row.querySelector('.repos-comment-card')) return 'composer';
  if (row.querySelector('.shimmer, .bolt-spinner')) return 'placeholder';
  // Card-less timeline rows are system events (reviewer added, policy changes, status updates).
  if (!row.querySelector('.bolt-card') && (row.textContent ?? '').trim()) return 'update';
  return 'unknown';
}
// Active and Pending threads are open. Unknown states count as open so nothing unresolved is hidden.
export function threadOpen(thread: Element): boolean {
  const label = thread.querySelector('[aria-label^="State button "]')?.getAttribute('aria-label') ?? '';
  const state = /^State button (.+) mode$/.exec(label)?.[1]?.trim().toLowerCase();
  if (state) return state === 'active' || state === 'pending';
  const actions = [...thread.querySelectorAll('button')].map(button => button.textContent?.trim());
  return !actions.includes('Reactivate') || actions.includes('Resolve');
}
export function threadAuthor(element: Element): string | null {
  const name = element.querySelector('.repos-discussion-comment-header .font-weight-semibold')?.textContent ??
    element.querySelector('.repos-comment-header-persona')?.getAttribute('aria-label') ?? '';
  return normalizeAuthor(name) || null;
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
  // Thread authors seen during this page session, so filters and lazy loading don't shrink the list.
  let knownKey = '';
  const known = new Map<string, { name: string; threads: number }>();
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
    const page = dropdown.closest('.repos-pr-details-page');
    const scroll = page?.scrollTop ?? 0;
    // Opening the menu and ADO's refocus can scroll the page; hold it still for the short operation.
    const hold = () => { if (page && page.scrollTop !== scroll) page.scrollTop = scroll; };
    page?.addEventListener('scroll', hold);
    try {
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
      hold();
      if (focused && focused !== trigger && focused !== document.body && focused.isConnected) focused.focus({ preventScroll: true });
      else if (document.activeElement === trigger) trigger.blur();
    } catch (reason) {
      console.error('[ADOverride] Could not select the native activity filter.', reason);
      filters.set(key, 'unavailable');
    } finally {
      page?.removeEventListener('scroll', hold);
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
      let foldedUpdates = 0;
      let blockedThreads = 0;
      let descriptionFolded = false;
      const tabs: PrTabState[] = [];
      const authors = new Map<string, PrAuthorState>();
      const blocked = new Set(profile.blockedAuthors.map(authorKey));
      const seen = (name: string | null, count = 1) => {
        if (!name || authors.size >= 200 && !authors.has(authorKey(name))) return;
        const key = authorKey(name);
        const item = authors.get(key) ?? { name, threads: 0, blocked: blocked.has(key) };
        item.threads = Math.max(item.threads, 0) + count;
        authors.set(key, item);
      };
      const mark = (element: Element, name: string, value = '') => {
        const attributes = desired.get(element) ?? new Map<string, string>();
        attributes.set(name, value); desired.set(element, attributes);
      };

      if (profile.compactHeader) {
        if (root.querySelector(':scope > .repos-pr-header')) { tokens.push(TOKENS.compactHeader); applied.push('compactHeader'); }
        else unsupported.push('compactHeader');
      }
      for (const tab of root.querySelectorAll<HTMLElement>(':scope > .repos-pr-details-page-tabbar [role="tab"]')) {
        const id = tab.id.startsWith('__bolt-tab-') ? tab.id.slice('__bolt-tab-'.length) : '';
        if (!isPrTabId(id) || tabs.length >= 60) continue;
        const selected = tab.getAttribute('aria-selected') === 'true';
        const hidden = !selected && profile.hiddenTabs.includes(id);
        if (hidden) mark(tab, HIDE, 'tab');
        tabs.push({ id, label: (tab.textContent ?? '').trim().slice(0, 200) || id, selected, hidden });
      }
      if (profile.hideHeaderReviewers) {
        const header = root.querySelector(':scope > .repos-pr-header');
        if (header) {
          applied.push('hideHeaderReviewers');
          const avatars = header.querySelector('.pr-header-reviewers');
          const row = avatars?.closest('.pr-secondary-title-row');
          if (avatars) mark(row && row.children.length === 1 ? row : avatars, HIDE, 'avatars');
        } else unsupported.push('hideHeaderReviewers');
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
        if (profile.foldDescription) {
          const card = root.querySelector<HTMLElement>('.repos-pr-description-card');
          const body = card?.querySelector<HTMLElement>('.repos-pr-description');
          if (card && body) {
            applied.push('foldDescription');
            const active = document.activeElement;
            const editing = !body.querySelector('.markdown-editor-preview') || Boolean(card.querySelector('textarea,[contenteditable="true"]')) ||
              Boolean(active && active !== document.body && card.contains(active) && !active.hasAttribute(UI));
            const id = `${pr.key}:description`;
            const open = opened.has(id);
            if (!editing && body.scrollHeight > DESCRIPTION_FOLD_HEIGHT + 60) {
              if (!open) { mark(body, FOLD); descriptionFolded = true; }
              keepButtons.add('description');
              button('description', card, open ? 'Show less' : 'Show more', open, () => toggle(id));
            }
          } else unsupported.push('foldDescription');
        }
        const feed = root.querySelector('table.activity-feed-list');
        const feedRows = feed ? [...feed.querySelectorAll<HTMLElement>(':scope > tbody > tr.bolt-timeline-row')]
          .filter(row => !row.hidden && row.getAttribute('aria-hidden') !== 'true') : [];
        const dropdownHost = root.querySelector<HTMLElement>('.repos-activity-filter-dropdown');
        const blockedOpen = opened.has(`${pr.key}:blocked`);
        const hiddenRows = new Set<HTMLElement>();
        const blockedRows: HTMLElement[] = [];
        for (const row of feedRows) {
          if (feedRowKind(row) !== 'comment') continue;
          const name = threadAuthor(row);
          seen(name);
          if (name && blocked.has(authorKey(name)) && !threadOpen(row)) blockedRows.push(row);
        }
        if (blockedRows.length && dropdownHost) {
          blockedThreads = blockedRows.length;
          if (!blockedOpen) for (const row of blockedRows) { mark(row, HIDE, 'blocked'); hiddenRows.add(row); }
          keepButtons.add('blocked');
          button('blocked', dropdownHost, blockedOpen ? `Hide ${blockedRows.length} from blocked authors` : `${blockedRows.length} from blocked authors`,
            blockedOpen, () => toggle(`${pr.key}:blocked`));
        }
        if (profile.foldUpdates) {
          if (feed) {
            applied.push('foldUpdates');
            const visible = feedRows.filter(row => !hiddenRows.has(row));
            for (const { start, end } of updateRuns(visible.map(feedRowKind))) {
              const first = visible[start];
              if (!first) continue;
              const iteration = first.querySelector('.activity-feed-timeline-iteration')?.textContent?.trim();
              const id = `${pr.key}:updates:${iteration || `row${feedRows.indexOf(first)}`}`;
              const open = opened.has(id);
              const count = end - start;
              if (!open) { for (const row of visible.slice(start + 1, end + 1)) mark(row, HIDE, 'update'); foldedUpdates += count; }
              const key = `updates:${id}`;
              keepButtons.add(key);
              const cards = first.querySelectorAll('.bolt-card');
              button(key, cards[cards.length - 1] ?? first.querySelector(':scope > td') ?? first, open ? `Hide ${count} updates` : `+${count} more updates`, open, () => toggle(id));
            }
          } else unsupported.push('foldUpdates');
        }
        if (profile.compactPushes) {
          if (feed) {
            applied.push('compactPushes');
            for (const row of feedRows) {
              const iteration = row.querySelector('.activity-feed-timeline-iteration')?.textContent?.trim();
              const column = row.querySelector<HTMLElement>('.bolt-table-card > .bolt-card-content > .flex-column');
              const header = column?.querySelector(':scope > .iteration-card-header');
              if (!iteration || !column || !header) continue;
              const details = [...column.children].filter(child => child !== header && !child.hasAttribute(UI));
              if (!details.length) continue;
              const id = `${pr.key}:commits:${iteration}`;
              const open = opened.has(id);
              if (!open) for (const child of details) mark(child, HIDE, 'commits');
              keepButtons.add(id);
              button(id, column, open ? 'Hide commits' : 'Show commits', open, () => toggle(id));
            }
          } else unsupported.push('compactPushes');
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
        for (const item of tree?.querySelectorAll('tr.bolt-tree-row .repos-file-explorer-tree-thread-item') ?? []) {
          const name = normalizeAuthor(item.querySelector('.bolt-coin')?.getAttribute('aria-label') ?? '') || null;
          seen(name);
        }
        const inline = [...root.querySelectorAll<HTMLElement>('.repos-editor-discussion')];
        inline.forEach((discussion, index) => {
          const thread = discussion.querySelector<HTMLElement>(':scope > .repos-discussion-thread, .repos-discussion-thread');
          const name = thread ? threadAuthor(thread) : null;
          if (!tree) seen(name);
          if (!thread || !name || !blocked.has(authorKey(name)) || threadOpen(thread)) return;
          const id = `${pr.key}:inline:${index}`;
          const open = opened.has(id);
          blockedThreads++;
          if (!open) mark(thread, HIDE, 'blocked');
          keepButtons.add(id);
          button(id, discussion, open ? 'Hide comment from blocked author' : 'Comment from a blocked author', open, () => toggle(id));
        });
      }
      if (tokens.length) mark(root, ROOT, tokens.join(' '));
      if (desired.size || keepButtons.size) { if (!style.isConnected) (document.head ?? document.documentElement).append(style); }
      else style.remove();
      sync(desired);
      removeButtons(keepButtons);
      if (resized && !desired.get(resized)?.has(PLACED)) { resize.unobserve(resized); resized = null; }
      const filter = profile.activeComments && pr.view === 'overview' ? filters.get(pr.key) ?? 'waiting' : 'off';
      const relevant = [...EVERY_TAB, ...(pr.view === 'overview' ? OVERVIEW : pr.view === 'files' ? FILES : [])];
      const missing = unsupported.filter(feature => relevant.includes(feature));
      if (knownKey !== pr.key) { known.clear(); knownKey = pr.key; }
      for (const [key, item] of authors) {
        const previous = known.get(key);
        if (previous) previous.threads = Math.max(previous.threads, item.threads);
        else if (known.size < 200) known.set(key, { name: item.name, threads: item.threads });
      }
      const blockedAll: PrAuthorState[] = [...known].map(([key, item]) => ({ name: item.name, threads: item.threads, blocked: blocked.has(key) }));
      for (const name of profile.blockedAuthors) if (!known.has(authorKey(name))) blockedAll.push({ name, threads: 0, blocked: true });
      publish({ version: 2, status: applied.length || tabs.some(tab => tab.hidden) ? 'active' : 'original', view: pr.view, applied, unsupported: missing,
        passedChecks, silentReviewers, treeComments, foldedUpdates, blockedThreads, descriptionFolded, filter, tabs,
        authors: blockedAll.slice(0, 200),
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
    if (!event.isTrusted || !(event.target instanceof Element) || !event.target.closest('.repos-activity-filter-dropdown') ||
      event.target.closest(`[${UI}]`)) return;
    const pr = parsePullRequest(address());
    if (pr) touched.add(pr.key);
  };
  document.addEventListener('pointerdown', interaction, true);
  document.addEventListener('keydown', interaction, true);
  const focusChange = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('.repos-pr-description-card')) schedule();
  };
  document.addEventListener('focusin', focusChange);
  document.addEventListener('focusout', focusChange);

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
      document.removeEventListener('focusin', focusChange);
      document.removeEventListener('focusout', focusChange);
      reset(); listeners.clear();
    },
  };
}
