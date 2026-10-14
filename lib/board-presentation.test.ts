import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardPresentation } from './board-presentation';
import { defaultBoardProfile } from './board-profile';
import { nativeBoardCardContent } from '../tests/browser/board-presentation-fixture';

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const box = this.getBoundingClientRect();
    return { 0: box, length: 1, item: index => index === 0 ? box : null, [Symbol.iterator]: () => [box][Symbol.iterator]() };
  });
});
afterEach(() => document.body.replaceChildren());

function fixture() {
  document.body.innerHTML = `<div class="kanban-board"><div class="kanban-board-column">
    <article class="wit-card boards-card">${nativeBoardCardContent()}</article></div></div>`;
  const root = document.querySelector<HTMLElement>('.kanban-board');
  if (!root) throw new Error('Missing native Board fixture.');
  const presentation = createBoardPresentation(document);
  const profile = { ...defaultBoardProfile(), compactCards: true };
  return { root, presentation, profile };
}

describe('native Board card presentation', () => {
  it('restores exact markup and applies only reversible markers to captured native wrappers', () => {
    const { root, presentation, profile } = fixture();
    try {
      const original = root.innerHTML;
      const result = presentation.apply(root, profile);
      expect(result).toMatchObject({ compactCards: true, mappedCards: 1, unsupportedCards: 0 });
      expect(root.querySelector('[data-ado-board-card]')).not.toBeNull();
      presentation.apply(root, null);
      expect(root.innerHTML).toBe(original);
    } finally { presentation.dispose(); }
  });
  it('maps assignee independently when the native card has no state row', () => {
    const { root, presentation, profile } = fixture();
    try {
      root.querySelector('.work-item-state-container')?.remove();
      presentation.apply(root, { ...profile, cardFields: { ...profile.cardFields, assignee: false } });
      expect(root.querySelector('.owner-row')?.hasAttribute('data-ado-board-hidden')).toBe(true);
    } finally { presentation.dispose(); }
  });
  it('keeps editing cards and their drafts native until the editor is closed', () => {
    const { root, presentation, profile } = fixture();
    try {
      const row = root.querySelector('.owner-row');
      if (!row) throw new Error('Missing native owner row.');
      row.insertAdjacentHTML('beforeend', '<input value="PRIVATE_DRAFT">');
      const original = root.innerHTML;
      presentation.apply(root, { ...profile, cardFields: { ...profile.cardFields, assignee: false } });
      expect(root.innerHTML).toBe(original);
      expect(root.querySelector<HTMLInputElement>('input')?.value).toBe('PRIVATE_DRAFT');
      row.querySelector('input')?.remove();
      presentation.apply(root, { ...profile, cardFields: { ...profile.cardFields, assignee: false } });
      expect(row.hasAttribute('data-ado-board-hidden')).toBe(true);
    } finally { presentation.dispose(); }
  });
  it('does not hide a focused native control when a saved field preference is applied', () => {
    const { root, presentation, profile } = fixture();
    try {
      const button = root.querySelector<HTMLElement>('.native-owner-button');
      if (!button) throw new Error('Missing native owner control.');
      button.focus();
      presentation.apply(root, { ...profile, cardFields: { ...profile.cardFields, assignee: false } });
      expect(document.activeElement).toBe(button);
      expect(root.querySelector('.owner-row')?.hasAttribute('data-ado-board-hidden')).toBe(false);
    } finally { presentation.dispose(); }
  });
  it('leaves an owner row containing unknown native content visible', () => {
    const { root, presentation, profile } = fixture();
    try {
      const row = root.querySelector('.owner-row');
      if (!row) throw new Error('Missing owner wrapper.');
      row.insertAdjacentHTML('beforeend', '<button>Unknown native action</button>');
      presentation.apply(root, { ...profile, cardFields: { ...profile.cardFields, assignee: false } });
      expect(row.hasAttribute('data-ado-board-hidden')).toBe(false);
    } finally { presentation.dispose(); }
  });
  it('does not rescan every descendant for scroll positions or rewrite attributes on unchanged reconciliation', () => {
    const { root, presentation, profile } = fixture();
    try {
      presentation.apply(root, profile);
      const queries = vi.spyOn(root, 'querySelectorAll');
      const writes = vi.spyOn(Element.prototype, 'removeAttribute');
      presentation.apply(root, profile);
      expect(queries.mock.calls.filter(([selector]) => selector === '*')).toHaveLength(0);
      expect(writes).not.toHaveBeenCalled();
    } finally { presentation.dispose(); }
  });
});
