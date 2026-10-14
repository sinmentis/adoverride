import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeBoardSnapshot, emptyBoardSnapshot } from './board';
import { createBoardController } from './board-controller';
import { applyPreferenceAction, defaultPreferences } from './preferences';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const box = this.getBoundingClientRect();
    return { 0: box, length: 1, item: index => index === 0 ? box : null, [Symbol.iterator]: () => [box][Symbol.iterator]() };
  });
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

function fixture() {
  document.body.innerHTML = `<div class="kanban-board"><div class="kanban-board-column-header-container">
    <span class="kanban-board-column-header"><span>Stage</span><button class="kanban-board-column-collapse-button" aria-expanded="true"></button></span>
    <span class="kanban-board-column-header">Other stage</span></div><div class="kanban-board-content">
    <div class="kanban-board-column"><div class="wit-card">PRIVATE_TICKET_BODY</div></div><div class="kanban-board-column"></div>
  </div></div>`;
  const controller = createBoardController(document, () => 'https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories');
  const preferences = applyPreferenceAction(defaultPreferences(), { kind: 'board-columns', viewKey: 'all', equal: true });
  return { controller, preferences };
}
describe('native Board adapter and status', () => {
  it('validates exact status shapes and count/activity invariants', () => {
    expect(decodeBoardSnapshot(emptyBoardSnapshot())).toEqual(emptyBoardSnapshot());
    expect(() => decodeBoardSnapshot({ ...emptyBoardSnapshot(), status: 'active' })).toThrow('Board status');
    expect(() => decodeBoardSnapshot({ ...emptyBoardSnapshot(), columns: 1 })).toThrow('Board status');
    expect(() => decodeBoardSnapshot({ ...emptyBoardSnapshot(), columns: 0.5 })).toThrow('counts');
    expect(() => decodeBoardSnapshot({ ...emptyBoardSnapshot(), trailingSpace: Infinity })).toThrow('geometry');
  });
  it('marks only mapped expanded native tracks and never serializes ticket contents', () => {
    const { controller, preferences } = fixture();
    try {
      controller.setPreferences(preferences);
      expect(document.querySelectorAll('[data-ado-board-expanded]')).toHaveLength(4);
      expect(controller.snapshot).toMatchObject({ status: 'active', effective: true, columns: 2, expanded: 2, collapsed: 0 });
      expect(JSON.stringify(controller.snapshot)).not.toContain('PRIVATE_TICKET_BODY');
      document.querySelector('.kanban-board-column-collapse-button')?.setAttribute('aria-expanded', 'false');
      controller.setPreferences({ ...preferences, revision: 1 });
      expect(document.querySelectorAll('[data-ado-board-expanded]')).toHaveLength(2);
      expect(controller.snapshot.collapsed).toBe(1);
      controller.setPreferences({ ...preferences, enabled: false, revision: 2 });
      expect(document.querySelectorAll('[data-ado-board-root]')).toHaveLength(0);
      expect(controller.snapshot.status).toBe('paused');
    } finally { controller.dispose(); }
  });
  it('rolls back for unmapped/split/swimlane regions instead of applying a partial column layout', () => {
    const { controller, preferences } = fixture();
    try {
      controller.setPreferences(preferences);
      document.querySelector('.kanban-board-content')?.append(document.createElement('section'));
      controller.setPreferences({ ...preferences, revision: 1 });
      expect(controller.snapshot.status).toBe('unsupported');
      expect(document.querySelectorAll('[data-ado-board-expanded]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-ado-board-style]')).toHaveLength(0);
    } finally { controller.dispose(); }
  });
  it('retains explicit settings errors and removes owned styles on disposal', () => {
    const { controller, preferences } = fixture();
    controller.setPreferences(preferences);
    controller.failSettings('Invalid saved Board profile.');
    expect(controller.snapshot).toMatchObject({ status: 'error', effective: false, message: 'Invalid saved Board profile.' });
    expect(document.querySelectorAll('[data-ado-board-expanded]')).toHaveLength(0);
    controller.setPreferences({ ...preferences, revision: 2 });
    expect(controller.snapshot.effective).toBe(true);
    controller.dispose();
    expect(document.querySelectorAll('[data-ado-board-style]')).toHaveLength(0);
  });
  it('reports only aggregate geometry without reading or serializing column labels', () => {
    const { controller, preferences } = fixture();
    try {
      controller.setPreferences(preferences);
      expect(decodeBoardSnapshot(controller.snapshot).columns).toBe(2);
      expect(controller.snapshot).not.toHaveProperty('columnOptions');
      expect(JSON.stringify(controller.snapshot)).not.toContain('Other stage');
      expect(() => decodeBoardSnapshot({ ...controller.snapshot, version: 3 })).toThrow('status');
    } finally { controller.dispose(); }
  });
  it('does not coerce invalid presentation counts', () => {
    const value = emptyBoardSnapshot();
    expect(() => decodeBoardSnapshot({ ...value, presentation: { ...value.presentation, hiddenFields: '1' } })).toThrow('counts');
    expect(() => decodeBoardSnapshot({ ...value, presentation: { ...value.presentation, mappedCards: -1 } })).toThrow('counts');
    expect(() => decodeBoardSnapshot({ ...value, presentation: { ...value.presentation, unsupportedCards: 0.5 } })).toThrow('counts');
  });
  it('does not activate or restore native collapse controls while changing preferences or disposing', () => {
    const { controller, preferences } = fixture();
    const button = document.querySelector<HTMLButtonElement>('.kanban-board-column-collapse-button');
    if (!button) throw new Error('Missing native collapse control.');
    const click = vi.fn();
    button.addEventListener('click', click);
    button.setAttribute('aria-expanded', 'false');
    try {
      controller.setPreferences(preferences);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      document.body.insertAdjacentHTML('beforeend', '<section role="dialog">Native settings</section>');
      controller.setPreferences({ ...preferences, enabled: false, revision: 1 });
      expect(controller.snapshot).toMatchObject({ status: 'paused', effective: false });
      expect(decodeBoardSnapshot(controller.snapshot).status).toBe('paused');
      document.querySelector('[role="dialog"]')?.remove();
      controller.setPreferences({ ...preferences, enabled: false, revision: 2 });
      expect(button.getAttribute('aria-expanded')).toBe('false');
    } finally { controller.dispose(); }
    expect(click).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
