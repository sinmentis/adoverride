import { isObject, rendered } from './ticket';

const MAX_NODES = 1200;
const CARDS_PER_COLUMN = 3;
const CARDS = '.wit-card,.boards-card';
const LEAF = 'input,textarea,select,iframe,img,svg,script,style,noscript,[contenteditable],[role="textbox"],.field-value,.wit-card-field-value,.rooster-editor,p,pre,code';
const TICKET = '.work-item-form-page,.work-item-form-dialog,[data-ado-ticket-ui]';
const REFERENCES = new Set([
  'System.Id', 'System.Title', 'System.WorkItemType', 'System.State', 'System.AssignedTo', 'System.Tags',
  'Microsoft.VSTS.Scheduling.StoryPoints', 'Microsoft.VSTS.Common.Priority',
]);
const ROLES = new Set(['button', 'link', 'tab', 'tablist', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option',
  'menu', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'grid', 'row', 'gridcell', 'columnheader', 'list', 'listitem',
  'group', 'region', 'navigation', 'toolbar', 'img', 'presentation', 'none', 'progressbar', 'status']);
const PROPERTIES = [
  'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self',
  'justify-content', 'gap', 'column-gap', 'row-gap', 'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'overflow', 'overflow-x', 'overflow-y', 'contain', 'transform', 'zoom', 'font-size', 'line-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
] as const;

export function captureBoardLayout(document: Document) {
  const roots = [...document.querySelectorAll<HTMLElement>('.kanban-board')]
    .filter(root => !root.closest(TICKET) && rendered(root));
  const root = roots.length === 1 ? roots[0] : null;
  if (!root) throw new Error('Open one visible Kanban Board to capture its layout.');
  if ([...document.querySelectorAll('.work-item-form-page,.work-item-form-dialog')].some(rendered)) {
    throw new Error('Close the foreground Ticket before capturing the Board.');
  }

  const scope = root.closest('.region-content') ?? root;
  const cards = [...root.querySelectorAll<HTMLElement>(CARDS)];
  const samples = new Set<HTMLElement>();
  for (const column of root.querySelectorAll('.kanban-board-column')) {
    for (const card of [...column.querySelectorAll<HTMLElement>(CARDS)].filter(rendered).slice(0, CARDS_PER_COLUMN)) samples.add(card);
  }
  const ids = new WeakMap<Element, string>();
  let nextId = 0;
  const id = (element: Element | null) => {
    if (!element) return null;
    let value = ids.get(element);
    if (!value) { value = `n${++nextId}`; ids.set(element, value); }
    return value;
  };
  const round = (number: number) => Math.round(number * 100) / 100;
  const styles = (style: CSSStyleDeclaration) => Object.fromEntries(PROPERTIES.map(property =>
    [property, style.getPropertyValue(property).replace(/url\([^)]*\)/gi, '[omitted URL]').slice(0, 512)]));
  const pending: { element: Element; depth: number }[] = [];
  for (let ancestor = scope.parentElement; ancestor && pending.length < 12; ancestor = ancestor.parentElement) {
    pending.push({ element: ancestor, depth: -1 });
  }
  pending.push({ element: scope, depth: 0 });
  const nodes = [];
  let truncated = false;
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index];
    if (!item) throw new Error('Board capture traversal changed.');
    const { element, depth } = item;
    if (!(element instanceof HTMLElement) || element.closest(TICKET) || element.matches('script,style,noscript') ||
      !rendered(element) || element.matches(CARDS) && !samples.has(element)) continue;
    if (nodes.length >= MAX_NODES || depth > 24) { truncated = true; continue; }
    const box = element.getBoundingClientRect();
    const role = element.getAttribute('role');
    const reference = ['data-field-name', 'data-field-ref-name', 'data-field-refname', 'data-ref-name', 'data-control-id']
      .map(attribute => element.getAttribute(attribute)).find(value => value !== null && REFERENCES.has(value)) ?? null;
    nodes.push({
      id: id(element), parent: id(element.parentElement), offsetParent: id(element.offsetParent),
      tag: element.tagName.toLowerCase(),
      classes: [...element.classList].filter(name => name.length <= 128 && !/\d{5,}|@|https?:|[a-f0-9]{8}-[a-f0-9-]{20,}/i.test(name) &&
        /^(?:wit-card|boards-card|kanban-|bolt-|flex-|font-|padding-|margin-|overflow-|text-|field-|work-item-|identity-|bowtie-|tag-|vss-|ms-|region-content$|selectable-text$)/.test(name)).slice(0, 24),
      role: role && ROLES.has(role) ? role : null,
      expanded: ['true', 'false'].includes(element.getAttribute('aria-expanded') ?? '') ? element.getAttribute('aria-expanded') : null,
      nativeReference: reference,
      box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
      client: { width: element.clientWidth, height: element.clientHeight },
      scroll: { width: element.scrollWidth, height: element.scrollHeight, left: round(element.scrollLeft), top: round(element.scrollTop) },
      computed: styles(window.getComputedStyle(element)), inline: styles(element.style),
    });
    if (depth >= 0 && !element.matches(LEAF)) {
      for (const child of element.children) pending.push({ element: child, depth: depth + 1 });
    }
  }
  const report = {
    kind: 'ado-board-presentation', version: 2,
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio,
      scale: window.visualViewport?.scale ?? 1 },
    nodeLimit: MAX_NODES, truncated, totalCards: cards.length, sampledCards: samples.size, nodes,
    notes: ['Local, read-only header and sampled-card structure.', 'No text, field values, work item IDs, URLs, cookies or image sources are read.'],
  };
  const text = JSON.stringify(report, null, 2);
  if (new TextEncoder().encode(text).byteLength > 4000000) throw new Error('Board layout exceeds the local size limit.');
  return {
    summary: JSON.stringify({ kind: report.kind, version: report.version, nodes: nodes.length, truncated,
      totalCards: cards.length, sampledCards: samples.size }, null, 2),
    report: text,
  };
}

export function decodeBoardLayoutReply(value: unknown): { report: string; summary: string } {
  if (!isObject(value) || value.ok !== true) {
    throw new Error(isObject(value) && typeof value.error === 'string' ? value.error : 'Could not capture Board layout.');
  }
  const decode = (key: 'report' | 'summary') => {
    const text = value[key];
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 4000000) throw new Error('Invalid Board layout report.');
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed) || parsed.kind !== 'ado-board-presentation' || parsed.version !== 2 ||
      typeof parsed.truncated !== 'boolean' || typeof parsed.totalCards !== 'number' || !Number.isSafeInteger(parsed.totalCards) || parsed.totalCards < 0 ||
      typeof parsed.sampledCards !== 'number' || !Number.isSafeInteger(parsed.sampledCards) || parsed.sampledCards < 0 ||
      parsed.sampledCards > parsed.totalCards) throw new Error('Invalid Board layout report.');
    if (key === 'report' ? !Array.isArray(parsed.nodes) || parsed.nodes.length > MAX_NODES :
      typeof parsed.nodes !== 'number' || !Number.isSafeInteger(parsed.nodes) || parsed.nodes < 0 || parsed.nodes > MAX_NODES) {
      throw new Error('Invalid Board layout nodes.');
    }
    return text;
  };
  return { report: decode('report'), summary: decode('summary') };
}
