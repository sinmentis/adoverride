// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { decodePrProfile, decodePrSnapshot, emptyPrSnapshot, KIWIFRUIT_HIDDEN_TABS, kiwifruitPrProfile, parsePullRequest, PR_FEATURE_IDS, updateRuns } from './pr';
import { applyPreferenceAction, decodePreferenceAction, decodePreferences, defaultPreferences } from './preferences';
import { feedRowKind, statusSections, threadAuthor, threadOpen } from './pr-controller';

describe('pull request pages', () => {
  it('parses the PR key and tab from both hosts', () => {
    expect(parsePullRequest('https://dev.azure.com/Example/Platform/_git/service/pullrequest/42')).toEqual({ key: 'dev.azure.com/example/42', view: 'overview' });
    expect(parsePullRequest('https://dev.azure.com/example/Platform/_git/service/pullrequest/42?_a=files&iteration=2')?.view).toBe('files');
    expect(parsePullRequest('https://dev.azure.com/example/Platform/_git/service/pullrequest/42?_a=commits')?.view).toBe('other');
    expect(parsePullRequest('https://example.visualstudio.com/Platform/_git/service/pullrequest/7')?.key).toBe('example.visualstudio.com/example/7');
    expect(parsePullRequest('https://dev.azure.com/example/Platform/_git/service')).toBeNull();
  });

  it('reads policy states from the native status icons', () => {
    document.body.innerHTML = `<div class="bolt-table-card"><div class="bolt-card-content"><div class="flex-column">
      <div><div class="flex-row"><svg class="bolt-status failed"></svg></div><table><tr><td><svg class="bolt-status success"></svg></td></tr></table></div>
      <div class="flex-row"><svg class="bolt-status active"></svg></div>
      <div class="flex-row"><svg class="bolt-status success"></svg></div>
    </div></div></div>`;
    expect(statusSections(document.querySelector('.bolt-table-card')!)?.map(item => item.state)).toEqual(['failed', 'active', 'success']);
    document.body.innerHTML = `<div class="bolt-table-card"><div class="bolt-card-content"><div class="flex-column"><div>Unknown</div></div></div></div>`;
    expect(statusSections(document.querySelector('.bolt-table-card')!)).toBeNull();
  });

  it('round-trips the snapshot and rejects malformed status', () => {
    const value = { ...emptyPrSnapshot(), status: 'active' as const, view: 'overview' as const, applied: ['railStatus' as const], passedChecks: 2 };
    expect(decodePrSnapshot(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(() => decodePrSnapshot({ ...value, applied: ['unknown'] })).toThrow();
    expect(() => decodePrSnapshot({ ...value, passedChecks: -1 })).toThrow();
    expect(() => decodePrSnapshot({ ...value, tabs: [{ id: 'bad id', label: 'x', selected: false, hidden: false }] })).toThrow();
    expect(() => decodePrSnapshot({ ...value, version: 1 })).toThrow();
  });

  it('finds update runs of two or more and lets other rows break them', () => {
    expect(updateRuns(['composer', 'update', 'comment', 'update', 'update', 'update', 'placeholder', 'update', 'update'])).toEqual([
      { start: 3, end: 5 }, { start: 7, end: 8 }]);
    expect(updateRuns(['update', 'comment', 'update', 'unknown', 'update'])).toEqual([]);
  });

  it('classifies native feed rows and reads thread authors', () => {
    const row = (html: string) => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${html}</td>`; return tr; };
    expect(feedRowKind(row('<div class="bolt-card"><a class="activity-feed-timeline-iteration">3</a></div>'))).toBe('update');
    expect(feedRowKind(row('<div class="repos-comment-card bolt-card">Add a comment</div>'))).toBe('composer');
    expect(feedRowKind(row('<div class="repos-comment-card bolt-card"><div class="repos-discussion-comment"></div></div>'))).toBe('comment');
    expect(feedRowKind(row('<div class="shimmer"></div>'))).toBe('placeholder');
    expect(feedRowKind(row('<div class="flex-row"><span>Someone joined as a reviewer</span></div>'))).toBe('update');
    expect(feedRowKind(row('<div class="bolt-card"></div>'))).toBe('unknown');
    const thread = row('<div class="repos-discussion-comment-header"><div class="font-weight-semibold">  Sample   Bot </div></div>');
    expect(threadAuthor(thread)).toBe('Sample Bot');
    expect(threadAuthor(row('<div class="repos-comment-header-persona" aria-label="Sample Reviewer"></div>'))).toBe('Sample Reviewer');
    expect(threadAuthor(row('<div></div>'))).toBeNull();
    const state = (html: string) => threadOpen(row(html));
    expect(state('<button aria-label="State button Active mode">Active</button>')).toBe(true);
    expect(state('<button aria-label="State button Pending mode">Pending</button>')).toBe(true);
    expect(state('<button aria-label="State button Closed mode">Closed</button><button>Reactivate</button>')).toBe(false);
    expect(state('<button aria-label="State button Resolved mode">Resolved</button>')).toBe(false);
    expect(state('<button>Reactivate</button>')).toBe(false);
    expect(state('<button>Resolve</button>')).toBe(true);
    expect(state('<div>No state</div>')).toBe(true);
  });
});

describe('pull request preferences', () => {
  it('turns every option on for fresh installs and documents saved before PR support', () => {
    expect(defaultPreferences().pr).toEqual(kiwifruitPrProfile());
    expect(PR_FEATURE_IDS.every(id => kiwifruitPrProfile()[id])).toBe(true);
    const { pr: _pr, ...older } = defaultPreferences();
    expect(decodePreferences({ ...older, enabled: false }).pr).toEqual(kiwifruitPrProfile());
  });

  it('keeps saved choices, fills new options, and rejects invalid values', () => {
    expect(decodePrProfile({ railStatus: false })).toEqual({ ...kiwifruitPrProfile(), railStatus: false });
    expect(kiwifruitPrProfile().hiddenTabs).toEqual(KIWIFRUIT_HIDDEN_TABS);
    expect(decodePrProfile({ hiddenTabs: [], blockedAuthors: [' Sample  Bot '] })).toMatchObject({ hiddenTabs: [], blockedAuthors: ['Sample Bot'] });
    expect(() => decodePrProfile({ hiddenTabs: ['a b'] })).toThrow();
    expect(() => decodePrProfile({ hiddenTabs: ['x', 'x'] })).toThrow();
    expect(() => decodePrProfile({ blockedAuthors: ['Bot', 'bot'] })).toThrow();
    expect(() => decodePrProfile({ blockedAuthors: ['x'.repeat(129)] })).toThrow();
    expect(() => decodePrProfile({ railStatus: 'yes' })).toThrow('railStatus');
    expect(() => decodePrProfile([])).toThrow();
  });

  it('applies toggles and the kiwifruit reset without touching other areas', () => {
    const base = defaultPreferences();
    const action = decodePreferenceAction({ kind: 'pr-feature', feature: 'collapseReviewers', enabled: false });
    const changed = applyPreferenceAction(base, action);
    expect(changed.pr.collapseReviewers).toBe(false);
    expect(changed.ticket).toEqual(base.ticket);
    expect(changed.views).toEqual(base.views);
    const tabbed = applyPreferenceAction(changed, decodePreferenceAction({ kind: 'pr-tab', id: 'commits', hidden: true }));
    expect(tabbed.pr.hiddenTabs).toEqual([...KIWIFRUIT_HIDDEN_TABS, 'commits']);
    expect(applyPreferenceAction(tabbed, decodePreferenceAction({ kind: 'pr-tab', id: 'updates', hidden: false })).pr.hiddenTabs).not.toContain('updates');
    const blocked = applyPreferenceAction(tabbed, decodePreferenceAction({ kind: 'pr-author', name: 'Sample Bot', blocked: true }));
    expect(applyPreferenceAction(blocked, decodePreferenceAction({ kind: 'pr-author', name: 'SAMPLE bot', blocked: true })).pr.blockedAuthors).toEqual(['SAMPLE bot']);
    expect(applyPreferenceAction(blocked, decodePreferenceAction({ kind: 'pr-author', name: 'sample bot', blocked: false })).pr.blockedAuthors).toEqual([]);
    expect(applyPreferenceAction(blocked, decodePreferenceAction({ kind: 'reset-pr' })).pr).toEqual({ ...kiwifruitPrProfile(), blockedAuthors: ['Sample Bot'] });
    expect(() => decodePreferenceAction({ kind: 'pr-tab', id: '../x y', hidden: true })).toThrow();
    expect(() => decodePreferenceAction({ kind: 'pr-author', name: '   ', blocked: true })).toThrow();
    expect(() => decodePreferenceAction({ kind: 'pr-feature', feature: 'nope', enabled: true })).toThrow();
  });
});
