// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { decodePrProfile, decodePrSnapshot, emptyPrSnapshot, kiwifruitPrProfile, parsePullRequest, PR_FEATURE_IDS } from './pr';
import { applyPreferenceAction, decodePreferenceAction, decodePreferences, defaultPreferences } from './preferences';
import { statusSections } from './pr-controller';

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
    expect(applyPreferenceAction(changed, decodePreferenceAction({ kind: 'reset-pr' })).pr).toEqual(kiwifruitPrProfile());
    expect(() => decodePreferenceAction({ kind: 'pr-feature', feature: 'nope', enabled: true })).toThrow();
  });
});
