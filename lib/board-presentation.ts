import type { BoardProfile } from './board-profile';
import { rendered } from './ticket';
import { captureTicketScroll, restoreTicketScroll } from './ticket-scroll';

const CARD = '.wit-card,.boards-card';
const EDITOR = 'input,textarea,select,iframe,[contenteditable],[role="textbox"],[role="combobox"]';
const TICKET = '.work-item-form-page,.work-item-form-dialog,[data-ado-ticket-ui]';
const HIDDEN = 'data-ado-board-hidden';
const ATTRIBUTES = [HIDDEN, 'data-ado-board-card', 'data-ado-board-card-content', 'data-ado-board-card-pair',
  'data-ado-board-card-state', 'data-ado-board-card-assignee', 'data-ado-board-card-tags', 'data-ado-board-card-indicators',
  'data-ado-board-title-spacing', 'data-ado-board-filter-spacing', 'data-ado-board-top-spacing'] as const;
export const BOARD_PRESENTATION_CSS = `
[${HIDDEN}]{display:none!important}
[data-ado-board-card]{margin-top:4px!important}
[data-ado-board-card-content]{padding:8px!important}
[data-ado-board-card-pair]{flex-direction:row!important;flex-wrap:wrap!important;align-items:center!important;gap:4px!important}
[data-ado-board-card-state]{width:auto!important;max-width:100%!important;flex:0 1 auto!important;margin-top:0!important}
[data-ado-board-card-assignee]{flex:1 1 160px!important;min-width:0!important}
[data-ado-board-card-tags],[data-ado-board-card-indicators]{margin-top:4px!important}
[data-ado-board-card-tags] .bolt-pill{margin-bottom:4px!important;margin-right:4px!important}
[data-ado-board-title-spacing]{padding-top:4px!important}
[data-ado-board-filter-spacing]{padding-top:4px!important;padding-bottom:4px!important}
[data-ado-board-top-spacing]{padding-top:4px!important}
`;
export interface BoardPresentation {
  compactCards: boolean;
  compactHeader: boolean;
  mappedCards: number;
  unsupportedCards: number;
  hiddenFields: number;
  message: string | null;
}
export const emptyBoardPresentation = (): BoardPresentation => ({
  compactCards: false, compactHeader: false, mappedCards: 0, unsupportedCards: 0, hiddenFields: 0, message: null,
});
function one<T>(items: T[]): T | null { return items.length === 1 ? items[0] ?? null : null; }
function safeLabel(element: Element): string | null {
  if (element.matches('input,textarea,select,iframe,[contenteditable],[role="button"],[role="textbox"]') ||
    element.querySelector('input,textarea,select,iframe,[contenteditable],[role="button"],[role="textbox"]')) return null;
  return element.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? null;
}
export function createBoardPresentation(document: Document) {
  const marked = new Set<HTMLElement>();
  let lastRoot: HTMLElement | null = null;
  const style = document.createElement('style');
  style.setAttribute('data-ado-board-style', '');
  style.textContent = BOARD_PRESENTATION_CSS;
  function clear(keep = new Map<HTMLElement, Set<string>>()) {
    for (const element of marked) {
      for (const attribute of ATTRIBUTES) if (!keep.get(element)?.has(attribute) && element.hasAttribute(attribute)) element.removeAttribute(attribute);
      if (!keep.has(element)) marked.delete(element);
    }
    if (!keep.size && style.isConnected) style.remove();
  }
  function commit(root: HTMLElement | null, keep: Map<HTMLElement, Set<string>>) {
    const changing = style.isConnected !== Boolean(keep.size) ||
      [...marked].some(element => ATTRIBUTES.some(attribute => element.hasAttribute(attribute) && !keep.get(element)?.has(attribute))) ||
      [...keep].some(([element, attributes]) => !marked.has(element) || [...attributes].some(attribute => !element.hasAttribute(attribute)));
    if (!changing) return;
    const scroll = root?.isConnected ? captureTicketScroll(root) : [];
    clear(keep);
    for (const [element, attributes] of keep) {
      for (const attribute of attributes) if (!element.hasAttribute(attribute)) element.setAttribute(attribute, '');
      marked.add(element);
    }
    if (keep.size && !style.isConnected) (document.head ?? document.documentElement).append(style);
    restoreTicketScroll(scroll);
  }
  return {
    apply(root: HTMLElement | null, profile: BoardProfile | null): BoardPresentation {
      if (root) for (const element of (root.closest('.bolt-page') ?? root)
        .querySelectorAll<HTMLElement>(ATTRIBUTES.map(attribute => `[${attribute}]`).join(','))) marked.add(element);
      if (!root || !profile) { commit(root ?? lastRoot, new Map()); lastRoot = root; return emptyBoardPresentation(); }
      lastRoot = root;
      const keep = new Map<HTMLElement, Set<string>>();
      const add = (element: HTMLElement, attribute: typeof ATTRIBUTES[number]) => {
        let attributes = keep.get(element);
        if (!attributes) { attributes = new Set(); keep.set(element, attributes); }
        attributes.add(attribute);
      };
      const result = emptyBoardPresentation();
      let editing = 0;
      let focused = 0;
      let unmappedFields = 0;
      const modifyingCards = profile.compactCards || Object.values(profile.cardFields).some(visible => !visible);
      if (modifyingCards) for (const card of root.querySelectorAll<HTMLElement>(CARD)) {
        if (card.parentElement?.closest(CARD) || card.closest(TICKET) || !rendered(card)) continue;
        if (card.querySelector(EDITOR)) { editing++; continue; }
        const content = one([...card.children].filter((child): child is HTMLElement =>
          child instanceof HTMLElement && child.matches('div.flex-column.flex-grow') &&
          Boolean(child.querySelector('.font-weight-semibold.selectable-text'))));
        const title = content?.children[0];
        const metadata = content?.children[1];
        const footer = content?.children[2];
        if (!content || !(title instanceof HTMLElement) || !title.matches('span.flex-row') ||
          !title.querySelector('a.bolt-link') || !(metadata instanceof HTMLElement) || !metadata.matches('div.flex-column') ||
          content.children.length > 3 || footer && (!(footer instanceof HTMLElement) || !footer.matches('div.flex-row.flex-wrap') ||
            !footer.children.length || [...footer.children].some(child => !child.matches('button.bolt-button.bolt-icon-button')))) {
          result.unsupportedCards++; continue;
        }
        result.mappedCards++;
        const nativeState = one([...metadata.querySelectorAll<HTMLElement>('.work-item-state-container')]);
        const state = nativeState?.children.length === 1 && nativeState.firstElementChild?.matches('[role="button"]') &&
          nativeState.querySelector('.work-item-state') ? nativeState : null;
        const identity = one([...metadata.querySelectorAll<HTMLElement>('.identity-view')]);
        const owner = identity?.closest<HTMLElement>('[role="button"]');
        const ownerRow = owner?.parentElement;
        const assignee = owner && owner.children.length === 1 && owner.firstElementChild === identity &&
          ownerRow?.matches('.flex-row') && ownerRow.children.length === 1 && metadata.contains(ownerRow) ? ownerRow : null;
        const pair = state?.parentElement;
        const tags = one([...metadata.children].filter((child): child is HTMLElement => child instanceof HTMLElement &&
          child.matches('div.margin-top-8') && child.children.length === 1 &&
          child.firstElementChild?.matches('.flex-row.flex-wrap') === true &&
          Boolean(child.querySelector('.bolt-pill')) &&
          [...child.firstElementChild.children].every(pill => pill.matches('.bolt-pill'))));
        if (profile.compactCards) {
          add(card, 'data-ado-board-card'); add(content, 'data-ado-board-card-content');
          if (state && pair && assignee && pair.children.length === 2 && assignee.parentElement === pair) {
            add(pair, 'data-ado-board-card-pair'); add(state, 'data-ado-board-card-state');
            add(assignee, 'data-ado-board-card-assignee');
          }
          if (tags) add(tags, 'data-ado-board-card-tags');
          if (footer instanceof HTMLElement) add(footer, 'data-ado-board-card-indicators');
          result.compactCards = true;
        }
        const hide = (element: HTMLElement | null, visible: boolean) => {
          if (element && !visible) {
            if (element.contains(document.activeElement)) { focused++; return; }
            add(element, HIDDEN); result.hiddenFields++;
          }
        };
        hide(state, profile.cardFields.state); hide(assignee, profile.cardFields.assignee);
        hide(tags, profile.cardFields.tags); hide(footer instanceof HTMLElement ? footer : null, profile.cardFields.indicators);
        if (nativeState && !state && !profile.cardFields.state || identity && !assignee && !profile.cardFields.assignee ||
          metadata.querySelector('.bolt-pill') && !tags && !profile.cardFields.tags) unmappedFields++;
        if (!profile.cardFields.storyPoints) for (const field of metadata.querySelectorAll<HTMLElement>('.field-container')) {
          const label = field.firstElementChild;
          const value = field.children[1];
          if (field.children.length === 2 && label && value?.matches('[role="button"]') && safeLabel(label) === 'story points') hide(field, false);
        }
      }
      if (profile.compactHeader) {
        const page = root.closest('.bolt-page');
        const header = page ? one([...page.children].filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element.matches('.bolt-header') && Boolean(element.querySelector('.bolt-header-title')) &&
          !element.querySelector('.bolt-tabbar'))) : null;
        const filters = page?.querySelector<HTMLElement>('.vss-FilterBar');
        const filterSpacing = filters?.parentElement;
        const topSpacing = root.parentElement;
        if (header && filters && filterSpacing?.parentElement === page && topSpacing &&
          topSpacing.matches('.flex-column.flex-grow') && topSpacing.parentElement?.parentElement === page) {
          add(header, 'data-ado-board-title-spacing'); add(filterSpacing, 'data-ado-board-filter-spacing');
          add(topSpacing, 'data-ado-board-top-spacing');
          for (const tab of page?.querySelectorAll<HTMLElement>('.bolt-tabbar .bolt-tab[role="tab"]') ?? []) {
            const label = tab.querySelector('.bolt-tab-text');
            if (label && ['analytics', 'feature timeline', 'epic roadmap'].includes(safeLabel(label) ?? '') &&
              tab.getAttribute('aria-selected') !== 'true' && !tab.contains(document.activeElement)) add(tab, HIDDEN);
          }
          for (const action of header.querySelectorAll<HTMLElement>('.bolt-header-command-item-button')) {
            const label = action.querySelector('.bolt-button-text');
            if (label && safeLabel(label) === 'view as backlog' && !action.contains(document.activeElement)) add(action, HIDDEN);
          }
          result.compactHeader = true;
        } else result.message = 'This Board header is not mapped. Its original layout is retained.';
      }
      result.message = [
        result.message,
        result.unsupportedCards ? `${result.unsupportedCards} card layouts are unmapped and unchanged.` : null,
        editing ? 'Editing cards retain their native layout.' : null,
        focused ? 'Focused card fields remain visible.' : null,
        unmappedFields ? 'Some card fields are unmapped and unchanged.' : null,
      ].filter(Boolean).join(' ') || null;
      commit(root, keep);
      return result;
    },
    dispose() { commit(lastRoot, new Map()); lastRoot = null; },
  };
}
