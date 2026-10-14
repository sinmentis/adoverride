export function observeBoardInteraction(document: Document, root: () => HTMLElement | null, changed: () => void) {
  let pointing = false;
  let dragging = false;
  const start = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !root()?.contains(target) || !target.closest('.wit-card,.boards-card')) return;
    if (event.type === 'dragstart') dragging = true; else pointing = true;
    changed();
  };
  const end = (event: Event) => {
    const active = pointing || dragging;
    if (event.type === 'dragend') dragging = false;
    else if (event.type === 'visibilitychange') { pointing = false; dragging = false; }
    else pointing = false;
    if (active !== (pointing || dragging) || event.type === 'visibilitychange') changed();
  };
  for (const type of ['pointerdown', 'dragstart']) document.addEventListener(type, start, true);
  for (const type of ['pointerup', 'pointercancel', 'dragend']) document.addEventListener(type, end, true);
  document.addEventListener('visibilitychange', end);
  return {
    get active() { return pointing || dragging; },
    reset() { pointing = false; dragging = false; },
    dispose() {
      for (const type of ['pointerdown', 'dragstart']) document.removeEventListener(type, start, true);
      for (const type of ['pointerup', 'pointercancel', 'dragend']) document.removeEventListener(type, end, true);
      document.removeEventListener('visibilitychange', end);
    },
  };
}
