import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeInspectionReply, inspectPage, isInspectRequest, ReaderVersionError, INSPECT_PROTOCOL } from './inspector';

const ADDRESS = 'https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const rectangles = this.closest('[hidden], [aria-hidden="true"]') ? [] : [new DOMRect(0, 0, 100, 40)];
    return Object.assign(rectangles, { item: (index: number) => rectangles[index] ?? null });
  });
});

describe('read-only work item inspector', () => {
  it('counts distinct IDs, ignores hidden cards, and does not change the DOM', () => {
    document.body.innerHTML = `
      <div class="kanban-board">
        <div class="boards-card wit-card"><span class="font-weight-semibold selectable-text">101</span><span>Private title</span></div>
        <div class="wit-card" data-work-item-id="102"></div>
        <div class="taskboard-card wit-card"><span class="work-item-id">#101</span></div>
        <div hidden><div class="wit-card" data-work-item-id="103"></div></div>
        <div aria-hidden="true"><div class="wit-card" data-work-item-id="104"></div></div>
      </div>`;
    const before = document.body.innerHTML;
    const result = inspectPage(document, ADDRESS, 1000);
    expect(result).toMatchObject({
      kind: 'cards',
      renderedItems: 3,
      uniqueTickets: 2,
      hiddenItems: 2,
      unidentifiedItems: 0,
      scannedAt: 1000,
    });
    expect(document.body.innerHTML).toBe(before);
    expect(JSON.stringify(result)).not.toContain('Private title');
    expect(JSON.stringify(result)).not.toContain('101');
  });

  it('reports cards without inventing ticket IDs', () => {
    document.body.innerHTML = '<div class="kanban-board"><div class="wit-card">No ID</div></div>';
    expect(inspectPage(document, ADDRESS)).toMatchObject({ renderedItems: 1, uniqueTickets: 0, unidentifiedItems: 1 });
  });

  it('distinguishes an empty board from a page without board cards', () => {
    expect(inspectPage(document, ADDRESS).kind).toBe('unrecognized');
    document.body.innerHTML = '<div class="kanban-board"></div>';
    expect(inspectPage(document, ADDRESS)).toMatchObject({ kind: 'cards', uniqueTickets: 0, renderedItems: 0 });
  });

  it.each([
    '_backlogs/backlog/Team%20A/Stories?showParents=true&System.AssignedTo=%40me',
    '_sprints/backlog/Team',
    '_queries/query/example',
    '_workitems/recentlyupdated',
  ])('counts list rows on %s, not navigation links or hidden rows', hub => {
    document.body.innerHTML = `
      <nav><a href="/example/Platform/_workitems/edit/999">Not a list item</a></nav>
      <table role="treegrid"><tbody>
        <tr role="row"><th role="columnheader">Title</th></tr>
        <tr role="row"><td><a href="/example/Platform/_workitems/edit/101">Private title</a></td></tr>
        <tr role="row"><td><a href="/example/Platform/_workitems/edit/102">Second item</a></td></tr>
        <tr role="row"><td><a href="/example/Platform/_workitems/edit/101">Duplicate</a></td></tr>
        <tr role="row" hidden><td><a href="/example/Platform/_workitems/edit/103">Hidden</a></td></tr>
      </tbody></table>`;
    const before = document.body.innerHTML;
    const result = inspectPage(document, `https://dev.azure.com/example/Platform/${hub}`);
    expect(result).toMatchObject({ kind: 'rows', renderedItems: 3, uniqueTickets: 2, hiddenItems: 1, matchedRows: 4 });
    expect(document.body.innerHTML).toBe(before);
    const { scannedAt: _, ...content } = result;
    expect(JSON.stringify(content)).not.toContain('Private title');
    expect(JSON.stringify(content)).not.toContain('101');
  });

  it('reads the ID column when titles are buttons and ignores related-item links', () => {
    document.body.innerHTML = `<table role="grid"><tbody>
      <tr role="row"><th role="columnheader">ID</th><th role="columnheader">Title</th></tr>
      <tr role="row"><td role="gridcell">101</td><td role="gridcell"><button>Title</button><a href="/example/Platform/_workitems/edit/999">Parent</a></td></tr>
    </tbody></table>`;
    expect(inspectPage(document, 'https://dev.azure.com/example/Platform/_backlogs/backlog/Team/Stories'))
      .toMatchObject({ kind: 'rows', uniqueTickets: 1, renderedItems: 1, unidentifiedItems: 0 });
  });

  it('does not guess a primary ID from ambiguous related links', () => {
    document.body.innerHTML = `<table role="grid"><tr role="row"><td>
      <a href="/example/Platform/_workitems/edit/101">Item</a>
      <a href="/example/Platform/_workitems/edit/102">Parent</a>
    </td></tr></table>`;
    expect(inspectPage(document, 'https://dev.azure.com/example/Platform/_queries/query/example'))
      .toMatchObject({ kind: 'rows', uniqueTickets: 0, renderedItems: 1, unidentifiedItems: 1 });
  });

  it('counts only the loaded editor, not its related work items', () => {
    document.body.innerHTML = `<div class="work-item-form-dialog"><div class="work-item-form-page">
      <header class="work-item-form-header">Work item</header>
      <table role="grid"><tr role="row"><td><a href="/example/Platform/_workitems/edit/999">Related item</a></td></tr></table>
    </div></div>`;
    expect(inspectPage(document, 'https://dev.azure.com/example/Platform/_workitems/edit/101'))
      .toMatchObject({ kind: 'work-item', uniqueTickets: 1, renderedItems: 1, matchedForms: 1 });
    document.body.innerHTML = '';
    expect(inspectPage(document, 'https://dev.azure.com/example/Platform/_workitems/edit/101').kind).toBe('unrecognized');
  });

  it('distinguishes an empty list, a query folder listing, and an unrelated hub', () => {
    const query = 'https://dev.azure.com/example/Platform/_queries';
    document.body.innerHTML = '<table role="grid"></table>';
    expect(inspectPage(document, query)).toMatchObject({ kind: 'rows', renderedItems: 0 });
    document.body.innerHTML = '<table role="grid"><tr role="row"><td><a href="/example/Platform/_queries/folder">Folder</a></td></tr></table>';
    expect(inspectPage(document, query).kind).toBe('unrecognized');
    expect(inspectPage(document, 'https://dev.azure.com/example/Platform/_git/repository').kind).toBe('unsupported');
  });

  it('recognizes legacy-host work item links and excludes foreign organizations', () => {
    document.body.innerHTML = `<table role="grid">
      <tr role="row"><td><a href="/DefaultCollection/Platform/_workitems/edit/101">Item</a></td></tr>
      <tr role="row"><td><a href="https://foreign.visualstudio.com/Platform/_workitems/edit/102">Foreign item</a></td></tr>
    </table>`;
    expect(inspectPage(document, 'https://example.visualstudio.com/DefaultCollection/Platform/_backlogs/backlog/Team/Stories'))
      .toMatchObject({ kind: 'rows', uniqueTickets: 1, renderedItems: 1 });
  });

  it('validates the message and reply boundary', () => {
    expect(isInspectRequest({ type: 'ado-customize/inspect' })).toBe(true);
    expect(isInspectRequest({ type: 'other' })).toBe(false);
    expect(isInspectRequest(null)).toBe(false);
    const inspection = inspectPage(document, ADDRESS);
    expect(decodeInspectionReply({ version: INSPECT_PROTOCOL, ok: true, inspection })).toEqual({ version: INSPECT_PROTOCOL, ok: true, inspection });
    expect(() => decodeInspectionReply({ version: INSPECT_PROTOCOL, ok: true, inspection: { ...inspection, uniqueTickets: -1 } })).toThrow('counts');
    expect(() => decodeInspectionReply({ version: INSPECT_PROTOCOL, ok: true, inspection: { ...inspection, uniqueTickets: 4 } })).toThrow('inconsistent');
    expect(() => decodeInspectionReply({ version: INSPECT_PROTOCOL, ok: true, inspection: { ...inspection, context: { ...inspection.context, pageKind: ['board'] } } })).toThrow('metadata');
    expect(() => decodeInspectionReply({ version: INSPECT_PROTOCOL, ok: true })).toThrow('invalid');
    expect(() => decodeInspectionReply({ ok: true, inspection })).toThrow(ReaderVersionError);
  });
});
