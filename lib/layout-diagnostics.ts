import { isObject, GROUP_SELECTOR } from './ticket';
import type { CardLayouts } from './card-layout';

export const LAYOUT_MESSAGE = 'ado-customize/layout-diagnostics';
export const LAYOUT_DURATION = 15000;
const MAX_NODES = 600;
const MAX_SNAPSHOTS = 6;
const MAX_REPORT_LENGTH = 16000000;
const PROPERTIES = [
  'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink',
  'flex-basis', 'align-items', 'align-self', 'justify-content', 'gap', 'column-gap', 'row-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-rows',
  'overflow', 'overflow-x', 'overflow-y', 'contain', 'content-visibility', 'transform', 'transform-origin',
  'zoom', 'opacity', 'visibility', 'z-index', 'clip-path', 'font-size', 'line-height',
  'color', 'background-color', 'color-scheme', 'transition-property', 'transition-duration',
] as const;
const LEAF = 'input, textarea, select, iframe, img, svg, [contenteditable], [role="textbox"], .rooster-editor, p, pre, code';
const HEADER_FIELDS = new Set([
  'System.Id', 'System.Title', 'System.WorkItemType', 'System.State', 'System.Reason',
  'System.AssignedTo', 'System.AreaPath', 'System.IterationPath', 'System.Tags',
]);

export interface LayoutReference { key: string; label: string; kind: string }
export interface LayoutContext {
  root: HTMLElement | null;
  bindings: ReadonlyMap<Element, LayoutReference>;
  page: string | null;
  enabled: boolean;
  hiddenTargets: string[];
  arrangements: CardLayouts;
  viewMode?: 'native' | 'workspace';
}
export type LayoutCommand = 'start' | 'export' | 'board';
export type LayoutTrace = (type: string, detail?: Record<string, string | number | null>) => void;

export function createLayoutRecorder(context: () => LayoutContext) {
  let started: number | null = null;
  let deadline = 0;
  let running = false;
  let interval = 0;
  let timeout = 0;
  let ids = new WeakMap<Element, string>();
  let nextId = 0;
  let generation = 0;
  let stopped = 0;
  const counters: Record<string, number> = {};
  let baseline: Record<string, number> = {};
  let recorded: Record<string, number> | null = null;
  const events: { ms: number; type: string; detail: Record<string, string | number | null> }[] = [];
  const snapshots: ReturnType<typeof capture>[] = [];
  const frames: ReturnType<typeof frame>[] = [];
  const lastEvent = new Map<string, number>();
  const round = (number: number) => Math.round(number * 100) / 100;
  const elapsed = () => round(performance.now() - (started ?? performance.now()));
  const nodeId = (element: Element | null): string | null => {
    if (!element) return null;
    let id = ids.get(element);
    if (!id) { id = `n${++nextId}`; ids.set(element, id); }
    return id;
  };
  const rect = (element: Element) => {
    const box = element.getBoundingClientRect();
    return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
  };
  function parent(element: Element): Element | null {
    const tree = element.getRootNode();
    return element.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
  }
  function styles(style: CSSStyleDeclaration) {
    const result: Record<string, string> = {};
    for (const property of PROPERTIES) {
      const value = style.getPropertyValue(property);
      if (value) result[property] = value.replace(/url\([^)]*\)/gi, '[omitted URL]').slice(0, 1000);
    }
    return result;
  }
  function describe(element: HTMLElement, kind: string) {
    const markers: Record<string, string> = {};
    for (const attribute of element.attributes) {
      if (attribute.name.startsWith('data-ado-ticket-')) markers[attribute.name] = attribute.value.slice(0, 512);
    }
    const nativeReference = ['data-field-name', 'data-ref-name', 'data-control-id']
      .map(name => element.getAttribute(name)).find(value => value !== null && HEADER_FIELDS.has(value)) ?? null;
    return {
      id: nodeId(element), parent: nodeId(parent(element)), offsetParent: nodeId(element.offsetParent),
      kind, tag: element.tagName.toLowerCase(),
      classes: [...element.classList].filter(name => name.length <= 128 && !/\d{5,}|@|https?:/i.test(name)).slice(0, 24),
      reference: context().bindings.get(element) ?? null,
      nativeReference, role: element.getAttribute('role'),
      box: rect(element), client: { width: element.clientWidth, height: element.clientHeight },
      scroll: { width: element.scrollWidth, height: element.scrollHeight, left: round(element.scrollLeft), top: round(element.scrollTop) },
      hover: element.matches(':hover'), hidden: element.hidden, markers,
      computed: styles(window.getComputedStyle(element)), inline: styles(element.style),
    };
  }
  function capture(stage: string) {
    const current = context();
    const nodes: ReturnType<typeof describe>[] = [];
    const seen = new Set<Element>();
    let truncated = false;
    let shellTruncated = false;
    let bodyTruncated = false;
    function add(element: Element, kind: string) {
      if (!(element instanceof HTMLElement) || seen.has(element)) return;
      if (nodes.length >= MAX_NODES) { truncated = true; return; }
      seen.add(element);
      nodes.push(describe(element, kind));
    }
    function visit(element: Element, depth: number, shell = false, limit = MAX_NODES, visited = new Set<Element>()) {
      if (shell && element.matches('.work-item-grid')) return;
      if (visited.has(element)) return;
      visited.add(element);
      if (depth > 18 || nodes.length >= limit) {
        truncated = true;
        if (shell) shellTruncated = true; else bodyTruncated = true;
        return;
      }
      const kind = element.matches(GROUP_SELECTOR) ? 'card' :
        element.matches('.work-item-grid') ? 'grid' :
          element.matches('.work-item-form-collapsible-header') ? 'header' :
            element.matches('.work-item-form-header') ? 'shell-header' :
              element.matches('.wif-tabbar, [role="tablist"]') ? 'navigation' :
                element.matches(LEAF) ? 'editor-or-leaf' : shell ? 'shell' : 'wrapper';
      add(element, kind);
      if (element.matches('ado-ticket-drag-handle')) {
        const button = element.shadowRoot?.querySelector<HTMLElement>('button');
        if (button) add(button, 'handle-button');
        return;
      }
      if (element.matches(LEAF) || element.hasAttribute('data-ado-ticket-ui')) return;
      for (const child of element.children) visit(child, depth + 1, shell, limit, visited);
    }
    const cards = [...current.root?.querySelectorAll(GROUP_SELECTOR) ?? []];
    if (current.root) {
      const ancestors: HTMLElement[] = [];
      for (let node: HTMLElement | null = current.root; node; node = node.parentElement) ancestors.unshift(node);
      for (const ancestor of ancestors) add(ancestor, ancestor === current.root ? 'form' : 'ancestor');
      // Capture the scaffold before detailed widgets can consume the node budget.
      for (const card of cards) {
        const parents: HTMLElement[] = [];
        for (let node = card.parentElement; node && node !== current.root; node = node.parentElement) parents.unshift(node);
        for (const ancestor of parents) add(ancestor, ancestor.matches('.work-item-grid') ? 'grid' : 'wrapper');
        add(card, 'card');
        const header = card.querySelector('.work-item-form-collapsible-header');
        if (header) add(header, 'header');
      }
      const shellLimit = Math.min(MAX_NODES, nodes.length + 240);
      const shellVisited = new Set<Element>();
      for (const region of current.root.querySelectorAll('.work-item-form-header, .work-item-form-subheader, .wif-tabbar, [role="tablist"]')) {
        if (!region.closest('.work-item-grid')) visit(region, 0, true, shellLimit, shellVisited);
      }
      visit(current.root, 0, true, shellLimit, shellVisited);
      const bodyVisited = new Set<Element>();
      for (const grid of current.root.querySelectorAll('.work-item-grid')) visit(grid, 0, false, MAX_NODES, bodyVisited);
    }
    const boundKeys = new Set([...current.bindings.values()].map(reference => reference.key));
    const hiddenTargets = current.hiddenTargets.filter(key => boundKeys.has(key));
    return { stage, ms: started === null ? 0 : elapsed(), page: current.page, enabled: current.enabled, viewMode: current.viewMode ?? 'native',
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio,
        scale: window.visualViewport?.scale ?? 1, scrollX: window.scrollX, scrollY: window.scrollY },
      hiddenTargets, hiddenTargetCounts: { total: current.hiddenTargets.length, recorded: hiddenTargets.length,
        omitted: current.hiddenTargets.length - hiddenTargets.length },
      arrangements: structuredClone(current.arrangements), truncated,
      coverage: { shellTruncated, bodyTruncated, discoveredCards: cards.length, capturedCards: cards.filter(card => seen.has(card)).length }, nodes };
  }
  function frame() {
    const root = context().root;
    return { ms: elapsed(), grids: [...root?.querySelectorAll('.work-item-grid') ?? []].map(grid => ({ id: nodeId(grid), ...rect(grid) })),
      handles: [...root?.querySelectorAll<HTMLElement>('ado-ticket-drag-handle') ?? []].map(handle => ({
        id: nodeId(handle), parent: nodeId(handle.parentElement), ...rect(handle),
        opacity: window.getComputedStyle(handle).opacity, hover: handle.matches(':hover'),
        connected: handle.isConnected, buttons: handle.shadowRoot?.querySelectorAll('button').length ?? 0,
      })) };
  }
  function counter(name: string, amount = 1) { counters[name] = (counters[name] ?? 0) + amount; }
  function snapshot(stage: string) {
    if (!running || snapshots.some(value => value.stage === stage) || snapshots.length >= MAX_SNAPSHOTS) return;
    snapshots.push(capture(stage));
  }
  function finish() {
    if (!running) return;
    snapshot('complete');
    running = false;
    stopped = performance.now();
    recorded = Object.fromEntries(Object.entries(counters).map(([key, count]) => [key, count - (baseline[key] ?? 0)]));
    window.clearInterval(interval);
    window.clearTimeout(timeout);
  }
  const trace: LayoutTrace = (type, detail = {}) => {
    counter(type);
    if (!running) return;
    const ms = elapsed();
    const noisy = type === 'mutation' || type === 'resize' || type === 'drag-move';
    if (!noisy || ms - (lastEvent.get(type) ?? -100) >= 100) {
      lastEvent.set(type, ms);
      if (events.length >= 300 && !noisy) {
        const index = events.findIndex(event => ['mutation', 'resize', 'drag-move'].includes(event.type));
        if (index >= 0) events.splice(index, 1);
      }
      if (events.length < 300) events.push({ ms, type, detail });
    }
    if (type === 'drag-start' || type === 'drag-end' || type === 'save-ack' || type === 'error') snapshot(type);
    if (type === 'save-ack') {
      const current = generation;
      for (const delay of [100, 500, 1500]) window.setTimeout(() => {
        if (generation === current) snapshot(`after-save-${delay}ms`);
      }, delay);
    }
  };
  function start() {
    if (!context().root) throw new Error('Open an active ticket before recording its layout.');
    finish();
    generation++;
    snapshots.length = 0; events.length = 0; frames.length = 0; lastEvent.clear();
    ids = new WeakMap(); nextId = 0;
    baseline = { ...counters };
    recorded = null;
    stopped = 0;
    started = performance.now(); deadline = started + LAYOUT_DURATION; running = true;
    snapshot('start');
    interval = window.setInterval(() => { if (frames.length < 160) frames.push(frame()); }, 100);
    timeout = window.setTimeout(finish, LAYOUT_DURATION);
  }
  function exportReport() {
    if (running && performance.now() >= deadline) finish();
    const current = capture('export');
    const report = { kind: 'ado-layout-capture', version: 1,
      status: running ? 'recording' : started !== null ? 'complete' : 'not-recorded',
      remainingMs: running ? Math.max(0, round(deadline - performance.now())) : 0,
      durationMs: started !== null ? round((stopped || performance.now()) - started) : 0,
      counters: { ...counters }, recordedCounters: recorded ?? Object.fromEntries(Object.entries(counters).map(([key, count]) =>
        [key, count - (baseline[key] ?? 0)])), events: [...events], frames: [...frames],
      snapshots: [...snapshots, current],
      notes: ['Local layout recording. Schema labels and CSS are included.', 'No ticket bodies, input values, ticket IDs, URLs, iframe contents, or cookies are read.',
        'Only currently bound hiding keys are included; omitted saved rules are counted without copying their keys.'] };
    const summary = { ...report, frames: frames.slice(-10), snapshots: report.snapshots.map(value => ({
      ...value, nodes: value.nodes.filter(node => ['form', 'grid', 'card', 'header', 'shell-header', 'shell', 'navigation', 'handle-button', 'ancestor'].includes(node.kind)),
    })) };
    const encoded = JSON.stringify(report, null, 2);
    const encodedSummary = JSON.stringify(summary, null, 2);
    if (encoded.length > MAX_REPORT_LENGTH || encodedSummary.length > MAX_REPORT_LENGTH) {
      throw new Error('The layout report exceeds the local size limit. Start a new recording without dragging, then download it.');
    }
    return { report: encoded, summary: encodedSummary };
  }
  return { start, exportReport, counter, snapshot, trace,
    nodeId,
    dispose() { finish(); generation++; snapshots.length = 0; events.length = 0; frames.length = 0; },
  };
}

export function decodeLayoutReply(value: unknown): { report: string; summary: string } {
  if (!isObject(value) || value.ok !== true) {
    throw new Error(isObject(value) && typeof value.error === 'string' ? value.error : 'Could not read layout diagnostics.');
  }
  const decode = (key: string) => {
    const text = value[key];
    if (typeof text !== 'string' || text.length > MAX_REPORT_LENGTH) throw new Error('Invalid layout report.');
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed) || parsed.kind !== 'ado-layout-capture' || parsed.version !== 1 ||
      !Array.isArray(parsed.snapshots) || !Array.isArray(parsed.events)) throw new Error('Invalid layout report.');
    return text;
  };
  return { report: decode('report'), summary: decode('summary') };
}
