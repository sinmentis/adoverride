import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_LOAD_TIMEOUT, createBoardAutoLoader, decodeAutoLoadSnapshot, emptyAutoLoadSnapshot } from './board-auto-load';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const box = this.getBoundingClientRect();
    return { 0: box, length: 1, item: index => index === 0 ? box : null, [Symbol.iterator]: () => [box][Symbol.iterator]() };
  });
});
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

function fixture(count = 1) {
  document.body.innerHTML = `<input aria-label="Filter"><div class="kanban-board">${Array.from({ length: count }, (_, index) =>
    `<div class="kanban-board-column"><article class="wit-card" data-work-item-id="${101 + index}">PRIVATE_BODY</article>
    <button class="native-more">Show more items</button></div>`).join('')}</div>`;
  const root = document.querySelector<HTMLElement>('.kanban-board');
  if (!root) throw new Error('Missing native loader fixture.');
  const columns = [...root.querySelectorAll<HTMLElement>('.kanban-board-column')];
  const calls: number[] = [];
  const buttons = columns.map(column => {
    const button = column.querySelector<HTMLButtonElement>('.native-more');
    if (!button) throw new Error('Missing native More button.');
    return button;
  });
  for (const [index, button] of buttons.entries()) button.addEventListener('click', () => calls.push(index));
  const loader = createBoardAutoLoader(document, () => {});
  const context = { root, columns, collapsed: new Set<HTMLElement>(), enabled: true, paused: false, key: document.location.href };
  return { loader, context, columns, buttons, calls };
}
function addCard(column: HTMLElement, id: string) {
  const card = document.createElement('article');
  card.className = 'wit-card'; card.setAttribute('data-work-item-id', id); column.append(card);
}

describe('native Board auto-loading', () => {
  it('validates state and only exposes aggregate counts', () => {
    expect(decodeAutoLoadSnapshot(emptyAutoLoadSnapshot())).toEqual(emptyAutoLoadSnapshot());
    expect(() => decodeAutoLoadSnapshot({ ...emptyAutoLoadSnapshot(), status: 'unknown' })).toThrow('status');
    expect(() => decodeAutoLoadSnapshot({ ...emptyAutoLoadSnapshot(), batches: -1 })).toThrow('counts');
    expect(() => decodeAutoLoadSnapshot({ ...emptyAutoLoadSnapshot(), itemsSeen: 0.5 })).toThrow('counts');
  });
  it('never clicks while off, paused, collapsed, or behind a native dialog', async () => {
    const { loader, context, columns, calls } = fixture();
    try {
      loader.update({ ...context, enabled: false });
      loader.update({ ...context, paused: true });
      loader.update({ ...context, collapsed: new Set(columns) });
      document.body.insertAdjacentHTML('beforeend', '<section role="dialog">Native settings</section>');
      loader.update(context);
      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toEqual([]);
      expect(loader.snapshot.status).toBe('paused');
    } finally { loader.dispose(); }
  });
  it('waits for native completion after card progress instead of starting a second request while busy', async () => {
    const { loader, context, columns, buttons, calls } = fixture(2);
    try {
      buttons[0]?.addEventListener('click', () => {
        const column = columns[0]; const button = buttons[0];
        if (!column || !button) throw new Error('Missing first batch.');
        column.setAttribute('aria-busy', 'true'); button.disabled = true;
        addCard(column, '201');
        window.setTimeout(() => { column.removeAttribute('aria-busy'); button.remove(); }, 1000);
      });
      buttons[1]?.addEventListener('click', () => {
        const column = columns[1];
        if (!column) throw new Error('Missing second batch.');
        addCard(column, '202'); buttons[1]?.remove();
      });
      loader.update(context);
      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toEqual([0]);
      await vi.advanceTimersByTimeAsync(1500);
      expect(calls).toEqual([0, 1]);
      expect(loader.snapshot).toMatchObject({ status: 'complete', batches: 2, remaining: 0, itemsSeen: 4 });
      expect(JSON.stringify(loader.snapshot)).not.toContain('PRIVATE_BODY');
    } finally { loader.dispose(); }
  });
  it('stops once a native control makes no progress, including replacement cards with the same IDs', async () => {
    const { loader, context, columns, buttons, calls } = fixture();
    try {
      buttons[0]?.addEventListener('click', () => {
        const card = columns[0]?.querySelector('.wit-card');
        if (!card) throw new Error('Missing unchanged item.');
        card.replaceWith(card.cloneNode(true));
      });
      loader.update(context);
      await vi.advanceTimersByTimeAsync(AUTO_LOAD_TIMEOUT + 1000);
      expect(calls).toEqual([0]);
      expect(loader.snapshot.status).toBe('error');
      expect(loader.snapshot.message).toContain('No loading progress');
      await vi.advanceTimersByTimeAsync(AUTO_LOAD_TIMEOUT * 2);
      expect(calls).toEqual([0]);
    } finally { loader.dispose(); }
  });
  it('surfaces a stalled batch and resumes only after explicit retry', async () => {
    const { loader, context, buttons, calls } = fixture();
    try {
      loader.update(context);
      await vi.advanceTimersByTimeAsync(AUTO_LOAD_TIMEOUT + 1);
      expect(loader.snapshot.status).toBe('error');
      buttons[0]?.addEventListener('click', () => buttons[0]?.remove());
      loader.retry();
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toEqual([0, 0]);
      expect(loader.snapshot.status).toBe('complete');
    } finally { loader.dispose(); }
  });
  it('rechecks an early deadline without reporting a stall before the monotonic 30-second threshold', async () => {
    const now = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => {
      const time = now();
      return time >= AUTO_LOAD_TIMEOUT ? time - 0.1 : time;
    });
    const { loader, context, calls } = fixture();
    try {
      loader.update(context);
      await vi.advanceTimersByTimeAsync(AUTO_LOAD_TIMEOUT);
      expect(loader.snapshot.status).toBe('loading');
      await vi.advanceTimersByTimeAsync(1);
      expect(loader.snapshot.status).toBe('error');
      expect(loader.snapshot.message).toContain('No loading progress for 30 seconds');
      await vi.advanceTimersByTimeAsync(AUTO_LOAD_TIMEOUT * 2);
      expect(calls).toEqual([0]);
    } finally { loader.dispose(); }
  });
  it('does not repeat a disappearing control when it returns with the same unchanged items', async () => {
    const { loader, context, columns, buttons, calls } = fixture();
    try {
      buttons[0]?.addEventListener('click', () => buttons[0]?.remove());
      loader.update(context);
      await vi.advanceTimersByTimeAsync(500);
      if (!columns[0] || !buttons[0]) throw new Error('Missing returning native control.');
      columns[0].append(buttons[0]);
      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toEqual([0]);
      expect(loader.snapshot.status).toBe('error');
      expect(loader.snapshot.message).toContain('without new items');
    } finally { loader.dispose(); }
  });
  it('waits for disabled native controls and leaves card-level Show more controls untouched', async () => {
    const { loader, context, columns, buttons, calls } = fixture();
    const decoy = document.createElement('button');
    const click = vi.fn();
    decoy.textContent = 'Show more items'; decoy.addEventListener('click', click);
    columns[0]?.querySelector('.wit-card')?.append(decoy);
    try {
      if (!buttons[0]) throw new Error('Missing disabled control.');
      buttons[0].disabled = true;
      buttons[0].addEventListener('click', () => buttons[0]?.remove());
      loader.update(context);
      expect(loader.snapshot.status).toBe('waiting');
      expect(calls).toEqual([]);
      buttons[0].disabled = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toEqual([0]);
      expect(click).not.toHaveBeenCalled();
      expect(loader.snapshot.status).toBe('complete');
    } finally { loader.dispose(); }
  });
  it('cancels future clicks on disable and releases observers and deadlines on disposal', async () => {
    const { loader, context, columns, buttons, calls } = fixture();
    buttons[0]?.addEventListener('click', () => { if (columns[0]) addCard(columns[0], '201'); });
    loader.update(context);
    loader.update({ ...context, enabled: false });
    await vi.advanceTimersByTimeAsync(AUTO_LOAD_TIMEOUT * 2);
    expect(calls).toEqual([0]);
    expect(loader.snapshot.status).toBe('off');
    loader.dispose();
    buttons[0]?.setAttribute('aria-disabled', 'false');
    await vi.advanceTimersByTimeAsync(AUTO_LOAD_TIMEOUT);
    expect(calls).toEqual([0]);
  });
  it('waits for an already-busy native control before starting any automatic batch', async () => {
    const { loader, context, buttons, calls } = fixture(2);
    try {
      if (!buttons[0]) throw new Error('Missing busy native control.');
      buttons[0].disabled = true;
      for (const button of buttons) button.addEventListener('click', () => button.remove());
      loader.update(context);
      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toEqual([]);
      expect(loader.snapshot.status).toBe('waiting');
      buttons[0].disabled = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toEqual([0, 1]);
      expect(loader.snapshot.status).toBe('complete');
    } finally { loader.dispose(); }
  });
  it('does not interpret a control replaced by a native spinner as a finished request', async () => {
    const { loader, context, columns, buttons, calls } = fixture(2);
    try {
      buttons[0]?.addEventListener('click', () => {
        const column = columns[0];
        if (!column) throw new Error('Missing loading column.');
        buttons[0]?.remove();
        const spinner = document.createElement('span');
        spinner.setAttribute('role', 'progressbar'); column.append(spinner);
        window.setTimeout(() => { addCard(column, '201'); spinner.remove(); }, 1000);
      });
      buttons[1]?.addEventListener('click', () => buttons[1]?.remove());
      loader.update(context);
      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toEqual([0]);
      await vi.advanceTimersByTimeAsync(1500);
      expect(calls).toEqual([0, 1]);
      expect(loader.snapshot.status).toBe('complete');
    } finally { loader.dispose(); }
  });
  it('keeps a native drag paused after the pointer sequence is cancelled by dragstart', async () => {
    const { loader, context, buttons, columns, calls } = fixture();
    try {
      const card = columns[0]?.querySelector('.wit-card');
      if (!card) throw new Error('Missing draggable native card.');
      buttons[0]?.addEventListener('click', () => buttons[0]?.remove());
      loader.update({ ...context, paused: true });
      card.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      card.dispatchEvent(new Event('dragstart', { bubbles: true }));
      card.dispatchEvent(new Event('pointercancel', { bubbles: true }));
      loader.update(context);
      await vi.advanceTimersByTimeAsync(500);
      expect(calls).toEqual([]);
      expect(loader.snapshot.status).toBe('paused');
      card.dispatchEvent(new Event('dragend', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toEqual([0]);
      expect(loader.snapshot.status).toBe('complete');
    } finally { loader.dispose(); }
  });
  it('releases an old drag when the native Board root is replaced', async () => {
    const { loader, context, columns } = fixture();
    try {
      const card = columns[0]?.querySelector('.wit-card');
      if (!card) throw new Error('Missing old drag source.');
      loader.update({ ...context, paused: true });
      card.dispatchEvent(new Event('dragstart', { bubbles: true }));
      const root = context.root.cloneNode(true);
      if (!(root instanceof HTMLElement)) throw new Error('Missing replacement Board root.');
      context.root.replaceWith(root);
      const replacementColumns = [...root.querySelectorAll<HTMLElement>('.kanban-board-column')];
      const click = vi.fn();
      const control = root.querySelector<HTMLButtonElement>('.native-more');
      if (!control) throw new Error('Missing replacement native control.');
      control.addEventListener('click', () => { click(); control.remove(); });
      loader.update({ ...context, root, columns: replacementColumns });
      await vi.advanceTimersByTimeAsync(1000);
      expect(click).toHaveBeenCalledOnce();
      expect(loader.snapshot.status).toBe('complete');
    } finally { loader.dispose(); }
  });
});
