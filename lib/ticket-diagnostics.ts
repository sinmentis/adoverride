import { CONTROL_SELECTOR, GROUP_SELECTOR, isObject } from './ticket';

export interface DragStructureNode {
  depth: number;
  kind: 'grid' | 'card' | 'header' | 'wrapper';
  tag: string;
  classes: string[];
  display: string;
}
export interface DragDiagnostics {
  status: 'disabled' | 'loading' | 'available' | 'blocked' | 'locked';
  reason: string | null;
  currentGroups: number;
  mappedGroups: number;
  candidates: number;
  missingHeaders: number;
  hiddenHeaders: number;
  grids: number;
  safeGrids: number;
  visibleCards: number;
  mountedHandles: number;
  structure: DragStructureNode[];
}
const nativeClass = /^(work-item-|workitem-|wit-|wif-|bolt-|flex-|scroll-|layout-)(?![a-z0-9_-]*\d{5})[a-z0-9_-]{1,64}$/i;
export function dragStructure(root: HTMLElement): DragStructureNode[] {
  const result: DragStructureNode[] = [];
  function add(element: Element, depth: number, kind: DragStructureNode['kind']) {
    if (result.length >= 100) return;
    result.push({ depth, kind, tag: element.tagName.toLowerCase(),
      classes: [...element.classList].filter(name => nativeClass.test(name)).slice(0, 8),
      display: window.getComputedStyle(element).display });
  }
  function visit(element: Element, depth: number) {
    if (depth > 8 || result.length >= 100 || element.closest('[data-ado-ticket-ui]')) return;
    if (element.matches(GROUP_SELECTOR)) {
      add(element, depth, 'card');
      for (const header of [...element.querySelectorAll('.work-item-form-collapsible-header, header, h1, h2, h3, [role="heading"]')]
        .filter(header => !header.closest(CONTROL_SELECTOR)).slice(0, 4)) add(header, depth + 1, 'header');
      return;
    }
    add(element, depth, element.matches('.work-item-grid') ? 'grid' : 'wrapper');
    for (const child of element.children) visit(child, depth + 1);
  }
  const grids = root.querySelectorAll('.work-item-grid');
  if (grids.length) for (const grid of grids) visit(grid, 0);
  else for (const group of root.querySelectorAll(GROUP_SELECTOR)) visit(group, 0);
  return result;
}
export function decodeDragDiagnostics(value: unknown): DragDiagnostics {
  if (!isObject(value) || (value.status !== 'disabled' && value.status !== 'loading' && value.status !== 'available' && value.status !== 'blocked' && value.status !== 'locked') ||
    (value.reason !== null && (typeof value.reason !== 'string' || value.reason.length > 300)) ||
    !Array.isArray(value.structure) || value.structure.length > 100) throw new Error('Invalid drag diagnostics.');
  const count = (key: string) => {
    const number = value[key];
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0 || number > 10000) throw new Error('Invalid drag diagnostic counts.');
    return number;
  };
  const structure = value.structure.map((node): DragStructureNode => {
    if (!isObject(node) || typeof node.depth !== 'number' || !Number.isSafeInteger(node.depth) || node.depth < 0 || node.depth > 9 ||
      (node.kind !== 'grid' && node.kind !== 'card' && node.kind !== 'header' && node.kind !== 'wrapper') ||
      typeof node.tag !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(node.tag) || typeof node.display !== 'string' ||
      !/^[a-z-]{1,30}(?: [a-z-]{1,30})?$/.test(node.display) || !Array.isArray(node.classes) ||
      node.classes.length > 8 || !node.classes.every(name => typeof name === 'string' && nativeClass.test(name))) {
      throw new Error('Invalid drag structural diagnostics.');
    }
    return { depth: node.depth, kind: node.kind, tag: node.tag, display: node.display, classes: [...node.classes] };
  });
  return { status: value.status, reason: value.reason,
    currentGroups: count('currentGroups'), mappedGroups: count('mappedGroups'), candidates: count('candidates'),
    missingHeaders: count('missingHeaders'), hiddenHeaders: count('hiddenHeaders'), grids: count('grids'),
    safeGrids: count('safeGrids'), visibleCards: count('visibleCards'), mountedHandles: count('mountedHandles'), structure };
}
