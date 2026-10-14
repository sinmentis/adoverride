import { isPageKind, parseAdoContext, type AdoContext } from './context';

export const INSPECT_MESSAGE = 'ado-customize/inspect' as const;
export const INSPECT_PROTOCOL = 25;

const CARDS = '.wit-card, .boards-card, .taskboard-card';
const GRIDS = '[role="grid"], [role="treegrid"], .bolt-table, .grid';
const ROWS = '[role="row"], .bolt-table-row, .grid-row';
const FORMS = '.work-item-form-page, .work-item-form-dialog';
export const ID_MARKERS = '.work-item-id, .artifact-link-id, [data-field-name="System.Id"], [data-column-key="System.Id"]';

export class ReaderVersionError extends Error {
  constructor() {
    super('The page reader belongs to a different extension build.');
    this.name = 'ReaderVersionError';
  }
}

export type InspectionKind = 'cards' | 'rows' | 'work-item' | 'unrecognized' | 'unsupported';

export interface Inspection {
  context: AdoContext;
  kind: InspectionKind;
  renderedItems: number;
  uniqueTickets: number;
  unidentifiedItems: number;
  hiddenItems: number;
  matchedCards: number;
  matchedRows: number;
  matchedForms: number;
  scannedAt: number;
}

export type InspectionReply =
  | { version: typeof INSPECT_PROTOCOL; ok: true; inspection: Inspection }
  | { version: typeof INSPECT_PROTOCOL; ok: false; error: string };

export function isInspectRequest(message: unknown): boolean {
  return typeof message === 'object' && message !== null &&
    'type' in message && message.type === INSPECT_MESSAGE;
}

function numericId(text: string | null | undefined): string | null {
  const match = /^\s*#?([1-9]\d*)\s*$/.exec(text ?? '');
  return match?.[1] ?? null;
}

export function ticketId(item: Element): string | null {
  return numericId(item.getAttribute('data-work-item-id') ??
    item.querySelector(`.font-weight-semibold.selectable-text, ${ID_MARKERS}`)?.textContent);
}

function isRendered(item: Element): boolean {
  return !item.closest('[hidden], [aria-hidden="true"]') && item.getClientRects().length > 0 &&
    item.ownerDocument.defaultView?.getComputedStyle(item).visibility !== 'hidden';
}

function linkedId(anchor: Element, address: string, context: AdoContext): string | null {
  const href = anchor.getAttribute('href');
  if (!href) return null;
  let target: URL;
  try {
    target = new URL(href, address);
  } catch {
    return null;
  }
  const linkedContext = parseAdoContext(target.href);
  if (!linkedContext || linkedContext.organization?.toLowerCase() !== context.organization?.toLowerCase()) return null;
  return /\/_workitems\/edit\/([1-9]\d*)(?:\/|$)/i.exec(target.pathname)?.[1] ??
    /^#\/?_workitems\/edit\/([1-9]\d*)(?:\/|$)/i.exec(target.hash)?.[1] ?? null;
}

function rowIdentity(row: Element, address: string, context: AdoContext): { candidate: boolean; id: string | null } {
  const attribute = row.getAttribute('data-work-item-id');
  if (attribute !== null) return { candidate: true, id: numericId(attribute) };
  const grid = row.closest(GRIDS);
  const headers = [...(grid?.querySelectorAll('[role="columnheader"], .grid-header-column, th') ?? [])];
  const idColumn = headers.findIndex(header => /^(id|work item id)$/i.test(header.textContent?.trim() ?? ''));
  if (idColumn >= 0) {
    const cells = row.querySelectorAll('[role="gridcell"], .grid-cell, td');
    const id = numericId(cells[idColumn]?.textContent);
    if (id) return { candidate: true, id };
  }
  const markers = [...row.querySelectorAll(ID_MARKERS)];
  const ids = new Set<string>();
  for (const marker of markers) {
    const id = numericId(marker.textContent);
    if (id) ids.add(id);
  }
  if (ids.size === 1) return { candidate: true, id: [...ids][0] ?? null };
  for (const anchor of row.querySelectorAll('a[href]')) {
    const id = linkedId(anchor, address, context);
    if (id) ids.add(id);
  }
  return { candidate: markers.length > 0 || ids.size > 0, id: ids.size === 1 ? [...ids][0] ?? null : null };
}

export function inspectPage(document: Document, address: string, scannedAt = Date.now()): Inspection {
  const context = parseAdoContext(address);
  if (!context) throw new Error('The inspector only supports Azure DevOps Services.');
  const cards = [...document.querySelectorAll(CARDS)];
  const forms = [...document.querySelectorAll(FORMS)].filter(form => !form.parentElement?.closest(FORMS));
  const rows = [...document.querySelectorAll(ROWS)].filter(row =>
    row.closest(GRIDS) && !row.querySelector('[role="columnheader"], th') &&
    !row.closest(`nav, [role="navigation"], ${FORMS}`) && !row.parentElement?.closest(ROWS),
  );
  const itemRows = rows.map(row => ({ row, ...rowIdentity(row, address, context) })).filter(row => row.candidate);
  const boardRoot = [...document.querySelectorAll('.kanban-board, .taskboard, .taskboard-view, td.taskboard-expanded-cell')].some(isRendered);
  const emptyGrid = rows.length === 0 && [...document.querySelectorAll(GRIDS)].some(isRendered);
  let kind: InspectionKind;
  let candidates: { element: Element; id: string | null }[] = [];
  if (context.pageKind === 'other' && forms.length === 0) {
    kind = 'unsupported';
  } else if (cards.length && (context.pageKind === 'board' || context.pageKind === 'taskboard' || itemRows.length === 0)) {
    kind = 'cards';
    candidates = cards.map(element => ({ element, id: ticketId(element) }));
  } else if (itemRows.length) {
    kind = 'rows';
    candidates = itemRows.map(row => ({ element: row.row, id: row.id }));
  } else if (forms.length) {
    kind = 'work-item';
    const addressId = /\/_workitems\/edit\/([1-9]\d*)(?:\/|$)/i.exec(new URL(address).pathname)?.[1] ?? null;
    candidates = forms.map(element => ({ element, id: ticketId(element.querySelector('.work-item-form-header') ?? element) ?? addressId }));
  } else if (boardRoot) {
    kind = 'cards';
  } else if (emptyGrid && (context.pageKind === 'backlog' || context.pageKind === 'query' || context.pageKind === 'workitems')) {
    kind = 'rows';
  } else {
    kind = 'unrecognized';
  }
  const rendered = candidates.filter(candidate => isRendered(candidate.element));
  const ids = new Set<string>();
  let unidentifiedItems = 0;
  for (const item of rendered) {
    if (item.id) ids.add(item.id);
    else unidentifiedItems++;
  }
  return {
    context,
    kind,
    renderedItems: rendered.length,
    uniqueTickets: ids.size,
    unidentifiedItems,
    hiddenItems: candidates.length - rendered.length,
    matchedCards: cards.length,
    matchedRows: rows.length,
    matchedForms: forms.length,
    scannedAt,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeInspectionReply(value: unknown): InspectionReply {
  if (!isObject(value)) throw new Error('The page returned an invalid inspector response.');
  if (typeof value.ok === 'boolean' && value.version !== INSPECT_PROTOCOL) throw new ReaderVersionError();
  if (value.ok === false && typeof value.error === 'string') return { version: INSPECT_PROTOCOL, ok: false, error: value.error };
  const inspection = value.inspection;
  if (value.ok !== true || !isObject(inspection) || !isObject(inspection.context)) {
    throw new Error('The page returned an invalid inspector response.');
  }
  const context = inspection.context;
  const nullableString = (item: unknown): item is string | null => item === null || typeof item === 'string';
  const pageKind = context.pageKind;
  const kind = inspection.kind;
  if (typeof context.host !== 'string' || !nullableString(context.organization) ||
    !nullableString(context.project) || !nullableString(context.boardPath) ||
    !isPageKind(pageKind) ||
    (kind !== 'cards' && kind !== 'rows' && kind !== 'work-item' && kind !== 'unrecognized' && kind !== 'unsupported')) {
    throw new Error('The page returned invalid inspector metadata.');
  }
  const count = (key: string): number => {
    const number = inspection[key];
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) {
      throw new Error('The page returned invalid inspector counts.');
    }
    return number;
  };
  const renderedItems = count('renderedItems');
  const uniqueTickets = count('uniqueTickets');
  const unidentifiedItems = count('unidentifiedItems');
  if (uniqueTickets + unidentifiedItems > renderedItems) throw new Error('The page returned inconsistent inspector counts.');
  return {
    version: INSPECT_PROTOCOL,
    ok: true,
    inspection: {
      context: {
        host: context.host,
        organization: context.organization,
        project: context.project,
        boardPath: context.boardPath,
        pageKind,
      },
      kind,
      renderedItems,
      uniqueTickets,
      unidentifiedItems,
      hiddenItems: count('hiddenItems'),
      matchedCards: count('matchedCards'),
      matchedRows: count('matchedRows'),
      matchedForms: count('matchedForms'),
      scannedAt: count('scannedAt'),
    },
  };
}
