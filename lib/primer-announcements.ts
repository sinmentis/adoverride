import { announce as announceLive, clearAnnouncer } from '@react-aria/live-announcer';

interface Options {
  politeness?: 'polite' | 'assertive' | 'off';
  delayMs?: number;
  from?: Element;
  appendTo?: Element;
}

// Chrome's isolated world cannot register Primer's live-region custom element.
export function announce(message: string, options: Options = {}) {
  const politeness = options.politeness ?? 'polite';
  let published = false;
  const timer = setTimeout(() => {
    if (politeness === 'off') return;
    announceLive(message, politeness);
    published = true;
  }, options.delayMs ?? 0);
  return {
    cancel() {
      clearTimeout(timer);
      if (published && politeness !== 'off') clearAnnouncer(politeness);
    },
  };
}

export function announceFromElement(element: Element, options: Options = {}) {
  return announce(element.textContent ?? '', options);
}
