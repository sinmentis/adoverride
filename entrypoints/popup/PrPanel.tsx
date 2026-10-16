import { useEffect, useId, useState } from 'react';
import { Flash, Text, ToggleSwitch } from '@primer/react';
import { UnderlinePanels } from '@primer/react/experimental';
import { PR_FEATURES, PR_FEATURE_IDS, type PrFeature, type PrSnapshot } from '@/lib/pr';
import type { PreferenceAction, Preferences } from '@/lib/preferences';
import { Help } from './Help';

function status(snapshot: PrSnapshot): string {
  if (snapshot.status === 'paused') return 'Customization paused.';
  if (snapshot.status === 'none') return 'Open a pull request to see it applied.';
  const parts: string[] = [];
  if (snapshot.view === 'overview') {
    if (snapshot.passedChecks) parts.push(`${snapshot.passedChecks} passed folded`);
    if (snapshot.silentReviewers) parts.push(`${snapshot.silentReviewers} silent reviewers folded`);
    if (snapshot.filter === 'applied') parts.push('active comments shown');
    if (snapshot.filter === 'kept') parts.push('your filter kept');
  }
  if (snapshot.view === 'files' && snapshot.treeComments) parts.push(`${snapshot.treeComments} comment rows hidden`);
  return snapshot.status === 'original' ? 'Native layout.' : parts.length ? `Applied: ${parts.join(', ')}.` : 'Applied.';
}

export function PrPanel({ preferences, snapshot, saving, update }: {
  preferences: Preferences; snapshot: PrSnapshot; saving: boolean;
  update: (action: PreferenceAction) => Promise<boolean>;
}) {
  const id = useId();
  const [tab, setTab] = useState<'overview' | 'files'>(snapshot.view === 'files' ? 'files' : 'overview');
  useEffect(() => { if (snapshot.view === 'files' || snapshot.view === 'overview') setTab(snapshot.view); }, [snapshot.view]);
  const row = (feature: PrFeature) => (
    <div className="ticket-row" key={feature}>
      <div className="label-with-help"><Text id={`${id}-${feature}`}>{PR_FEATURES[feature].title}</Text>
        <Help label={PR_FEATURES[feature].title} text={PR_FEATURES[feature].help} /></div>
      <ToggleSwitch size="small" aria-labelledby={`${id}-${feature}`} checked={preferences.pr[feature]} disabled={saving}
        onChange={enabled => void update({ kind: 'pr-feature', feature, enabled })} />
    </div>
  );
  return <section className="board-settings" aria-label="Pull request customization">
    <UnderlinePanels aria-label="Pull request settings" className="ticket-tabs" value={tab}
      onChange={({ value }) => setTab(value === 'files' ? 'files' : 'overview')}>
      <UnderlinePanels.Tab value="overview">Overview</UnderlinePanels.Tab>
      <UnderlinePanels.Tab value="files">Files</UnderlinePanels.Tab>
      <UnderlinePanels.Panel value="overview">
        {PR_FEATURE_IDS.filter(feature => PR_FEATURES[feature].tab === 'overview').map(row)}
      </UnderlinePanels.Panel>
      <UnderlinePanels.Panel value="files">
        {PR_FEATURE_IDS.filter(feature => PR_FEATURES[feature].tab === 'files').map(row)}
      </UnderlinePanels.Panel>
    </UnderlinePanels>
    {snapshot.message ? <Flash role="alert" variant={snapshot.status === 'error' ? 'danger' : 'warning'}>{snapshot.message}
      {snapshot.unsupported.length > 0 && ` Not found: ${snapshot.unsupported.map(feature => PR_FEATURES[feature].title).join(', ')}.`}</Flash> :
      <Text as="p" className="caption" role="status">{status(snapshot)}</Text>}
  </section>;
}
