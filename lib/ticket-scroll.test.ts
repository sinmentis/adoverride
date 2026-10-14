import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTicketScroll, restoreTicketScroll } from './ticket-scroll';

describe('synchronous native scroll preservation', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('captures scrolled ancestors and native descendants but not unrelated pages or owned controls', () => {
    document.body.innerHTML = '<main><section><div class="native-editor"></div><div data-ado-ticket-ui="test"></div></section></main><aside></aside>';
    const root = document.querySelector('section');
    const ancestor = document.querySelector('main');
    const editor = document.querySelector('.native-editor');
    const unrelated = document.querySelector('aside');
    const owned = document.querySelector('[data-ado-ticket-ui]');
    if (!(root instanceof HTMLElement) || !(ancestor instanceof HTMLElement) || !(editor instanceof HTMLElement) ||
      !(unrelated instanceof HTMLElement) || !(owned instanceof HTMLElement)) throw new Error('Missing scroll fixture.');
    root.scrollTop = 200;
    ancestor.scrollTop = 300;
    editor.scrollLeft = 40;
    unrelated.scrollTop = 500;
    owned.scrollTop = 20;
    expect(captureTicketScroll(root)).toEqual([
      { element: root, top: 200, left: 0 }, { element: ancestor, top: 300, left: 0 }, { element: editor, top: 0, left: 40 },
    ]);
  });

  it('restores only changed connected positions synchronously without smooth scrolling', () => {
    const root = document.createElement('section');
    document.body.append(root);
    root.scrollTop = 250;
    root.scrollLeft = 40;
    const positions = captureTicketScroll(root);
    const scroll = vi.fn();
    root.scrollTo = scroll;
    restoreTicketScroll(positions);
    expect(scroll).not.toHaveBeenCalled();
    root.scrollTop = 0;
    root.scrollLeft = 0;
    restoreTicketScroll(positions);
    expect(scroll).toHaveBeenCalledWith({ top: 250, left: 40, behavior: 'instant' });
    root.remove();
    scroll.mockClear();
    restoreTicketScroll(positions);
    expect(scroll).not.toHaveBeenCalled();
  });
});
