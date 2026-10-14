interface ScrollPosition { element: HTMLElement; top: number; left: number }

export function captureTicketScroll(root: HTMLElement): ScrollPosition[] {
  const elements = new Set<HTMLElement>();
  for (let ancestor: HTMLElement | null = root; ancestor; ancestor = ancestor.parentElement) elements.add(ancestor);
  const documentScroller = root.ownerDocument.scrollingElement;
  if (documentScroller instanceof HTMLElement) elements.add(documentScroller);
  for (const element of root.querySelectorAll('*')) {
    if (element instanceof HTMLElement && !element.closest('[data-ado-ticket-ui]')) elements.add(element);
  }
  return [...elements].flatMap(element => {
    const top = element.scrollTop;
    const left = element.scrollLeft;
    return top !== 0 || left !== 0 ? [{ element, top, left }] : [];
  });
}

export function restoreTicketScroll(positions: ScrollPosition[]) {
  for (const { element, top, left } of positions) {
    if (element.isConnected && (element.scrollTop !== top || element.scrollLeft !== left)) {
      element.scrollTo({ top, left, behavior: 'instant' });
    }
  }
}
