import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureBoardLayout, decodeBoardLayoutReply } from './board-layout-report';

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const box = this.getBoundingClientRect();
    return { 0: box, length: 1, item: index => index === 0 ? box : null, [Symbol.iterator]: () => [box][Symbol.iterator]() };
  });
});
afterEach(() => document.body.replaceChildren());

function fixture(cards = 1) {
  document.body.innerHTML = `<main class="region-content"><header class="bolt-header"><button>Private team heading</button></header>
    <div class="kanban-board"><div class="kanban-board-column">${Array.from({ length: cards }, () =>
    `<article class="wit-card" data-work-item-id="987654321"><a href="https://private.example/ticket/987654321" title="PRIVATE_TITLE">
      <span class="font-weight-semibold selectable-text">PRIVATE_TITLE</span></a>
      <div class="field-row" data-field-name="System.AssignedTo"><img src="https://private.example/avatar"><span>PRIVATE_OWNER</span></div>
      <div class="field-row" data-field-name="Custom.PrivateField"><span>PRIVATE_VALUE</span></div>
      <input value="PRIVATE_DRAFT"><div class="field-value"><span class="private-content">PRIVATE_BODY</span></div>
    </article>`).join('')}</div></div></main>`;
}

describe('content-free Board presentation capture', () => {
  it('captures actual field/header wrappers without reading or exporting text, values, IDs or URLs', () => {
    fixture();
    const markup = document.body.innerHTML;
    for (const element of document.querySelectorAll('article,article *')) {
      vi.spyOn(element, 'textContent', 'get').mockImplementation(() => { throw new Error('Text must not be read.'); });
    }
    const input = document.querySelector('input');
    if (!input) throw new Error('Missing native input.');
    vi.spyOn(input, 'value', 'get').mockImplementation(() => { throw new Error('Values must not be read.'); });
    const result = captureBoardLayout(document);
    const report = JSON.parse(result.report);
    expect(report).toMatchObject({ kind: 'ado-board-presentation', version: 2, totalCards: 1, sampledCards: 1, truncated: false });
    expect(report.nodes.some((node: { classes: string[] }) => node.classes.includes('bolt-header'))).toBe(true);
    expect(report.nodes.some((node: { nativeReference: string | null }) => node.nativeReference === 'System.AssignedTo')).toBe(true);
    for (const text of ['PRIVATE_TITLE', 'PRIVATE_OWNER', 'PRIVATE_VALUE', 'PRIVATE_DRAFT', 'PRIVATE_BODY', 'Custom.PrivateField',
      '987654321', 'private.example', 'Private team heading', 'private-content']) expect(result.report).not.toContain(text);
    expect(document.body.innerHTML).toBe(markup);
  });
  it('samples bounded native cards without truncating the prioritized header and sampled interiors', () => {
    fixture(20);
    const report = JSON.parse(captureBoardLayout(document).report);
    expect(report).toMatchObject({ totalCards: 20, sampledCards: 3, truncated: false });
    expect(report.nodes.filter((node: { classes: string[] }) => node.classes.includes('wit-card'))).toHaveLength(3);
    expect(report.nodes.length).toBeLessThan(1200);
  });
  it('fails explicitly for absent/multiple Boards and foreground Tickets', () => {
    expect(() => captureBoardLayout(document)).toThrow('one visible');
    fixture();
    document.body.insertAdjacentHTML('beforeend', '<div class="work-item-form-dialog"></div>');
    expect(() => captureBoardLayout(document)).toThrow('Close the foreground Ticket');
    document.querySelector('.work-item-form-dialog')?.remove();
    document.body.insertAdjacentHTML('beforeend', '<div class="kanban-board"></div>');
    expect(() => captureBoardLayout(document)).toThrow('one visible');
  });
  it('records truncation instead of returning an unbounded structure', () => {
    fixture();
    const header = document.querySelector('header');
    if (!header) throw new Error('Missing native header.');
    for (let index = 0; index < 1500; index++) header.append(document.createElement('span'));
    const report = JSON.parse(captureBoardLayout(document).report);
    expect(report.truncated).toBe(true);
    expect(report.nodes.length).toBe(1200);
  });
  it('decodes the separate Board reply without weakening the existing Ticket recorder contract', () => {
    fixture();
    const reply = { ok: true, ...captureBoardLayout(document) };
    expect(decodeBoardLayoutReply(reply)).toEqual({ report: reply.report, summary: reply.summary });
    expect(() => decodeBoardLayoutReply({ ok: false, error: 'Board unavailable.' })).toThrow('Board unavailable');
    expect(() => decodeBoardLayoutReply({ ...reply, report: JSON.stringify({ kind: 'ado-layout-capture', version: 1 }) })).toThrow('Invalid Board');
    expect(() => decodeBoardLayoutReply({ ...reply, summary: JSON.stringify({ kind: 'ado-board-presentation', version: 2,
      truncated: false, totalCards: 1, sampledCards: 2, nodes: 10 }) })).toThrow('Invalid Board');
    expect(() => decodeBoardLayoutReply({ ...reply, summary: JSON.stringify({ kind: 'ado-board-presentation', version: 2,
      truncated: false, totalCards: 1, sampledCards: 1, nodes: 1201 }) })).toThrow('nodes');
  });
});
