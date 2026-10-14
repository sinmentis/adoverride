import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce as live, clearAnnouncer } from '@react-aria/live-announcer';
import { announce, announceFromElement } from './primer-announcements';

vi.mock('@react-aria/live-announcer', () => ({ announce: vi.fn(), clearAnnouncer: vi.fn() }));
describe('isolated Primer announcements', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => vi.useRealTimers());
  it('uses a standard live announcer and supports cancelling a queued announcement', () => {
    announce('Saved', { politeness: 'assertive' });
    vi.runAllTimers();
    expect(live).toHaveBeenCalledWith('Saved', 'assertive');
    const pending = announce('Cancelled', { delayMs: 500 });
    pending.cancel();
    vi.runAllTimers();
    expect(live).toHaveBeenCalledTimes(1);
  });
  it('announces owned UI text and clears a published announcement', () => {
    const status = document.createElement('span');
    status.textContent = 'Saving card positions';
    const message = announceFromElement(status);
    vi.runAllTimers();
    expect(live).toHaveBeenCalledWith('Saving card positions', 'polite');
    message.cancel();
    expect(clearAnnouncer).toHaveBeenCalledWith('polite');
  });
});
