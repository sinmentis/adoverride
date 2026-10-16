import { useEffect, useId, useState } from 'react';
import { Button, Flash, Text, TextInput, ToggleSwitch } from '@primer/react';
import { UnderlinePanels } from '@primer/react/experimental';
import { authorKey, isAuthorName, PR_FEATURES, PR_FEATURE_IDS, type PrFeature, type PrSnapshot } from '@/lib/pr';
import type { PreferenceAction, Preferences } from '@/lib/preferences';
import { Help } from './Help';

type PrTab = 'overview' | 'files' | 'tabs' | 'blocked';

function status(snapshot: PrSnapshot): string {
  if (snapshot.status === 'paused') return 'Customization paused.';
  if (snapshot.status === 'none') return 'Open a pull request to see it applied.';
  const parts: string[] = [];
  if (snapshot.view === 'overview') {
    if (snapshot.passedChecks) parts.push(`${snapshot.passedChecks} passed folded`);
    if (snapshot.silentReviewers) parts.push(`${snapshot.silentReviewers} silent reviewers folded`);
    if (snapshot.descriptionFolded) parts.push('description folded');
    if (snapshot.foldedUpdates) parts.push(`${snapshot.foldedUpdates} updates folded`);
    if (snapshot.filter === 'applied') parts.push('active comments shown');
    if (snapshot.filter === 'kept') parts.push('your filter kept');
  }
  if (snapshot.view === 'files' && snapshot.treeComments && snapshot.applied.includes('hideTreeComments')) parts.push(`${snapshot.treeComments} comment rows hidden`);
  if (snapshot.blockedThreads) parts.push(`${snapshot.blockedThreads} from blocked authors`);
  const hiddenTabs = snapshot.tabs.filter(tab => tab.hidden).length;
  if (hiddenTabs) parts.push(`${hiddenTabs} tabs hidden`);
  return snapshot.status === 'original' ? 'Native layout.' : parts.length ? `Applied: ${parts.join(', ')}.` : 'Applied.';
}

export function PrPanel({ preferences, snapshot, saving, update }: {
  preferences: Preferences; snapshot: PrSnapshot; saving: boolean;
  update: (action: PreferenceAction) => Promise<boolean>;
}) {
  const id = useId();
  const [tab, setTab] = useState<PrTab>(snapshot.view === 'files' ? 'files' : 'overview');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  useEffect(() => { if (snapshot.view === 'files' || snapshot.view === 'overview') setTab(snapshot.view); }, [snapshot.view]);
  const row = (feature: PrFeature) => (
    <div className="ticket-row" key={feature}>
      <div className="label-with-help"><Text id={`${id}-${feature}`}>{PR_FEATURES[feature].title}</Text>
        <Help label={PR_FEATURES[feature].title} text={PR_FEATURES[feature].help} /></div>
      <ToggleSwitch size="small" aria-labelledby={`${id}-${feature}`} checked={preferences.pr[feature]} disabled={saving}
        onChange={enabled => void update({ kind: 'pr-feature', feature, enabled })} />
    </div>
  );
  const pageTabs = snapshot.tabs;
  const savedOnly = preferences.pr.hiddenTabs.filter(tabId => !pageTabs.some(item => item.id === tabId));
  const tabRow = (tabId: string, label: string, note?: string) => (
    <div className="ticket-row" key={tabId}>
      <div className="pr-list-label"><Text id={`${id}-tab-${tabId}`} title={label}>{label}</Text>{note && <Text className="caption">{note}</Text>}</div>
      <ToggleSwitch size="small" aria-labelledby={`${id}-tab-${tabId}`} checked={!preferences.pr.hiddenTabs.includes(tabId)} disabled={saving}
        onChange={visible => void update({ kind: 'pr-tab', id: tabId, hidden: !visible })} />
    </div>
  );
  const blockedKeys = new Set(preferences.pr.blockedAuthors.map(authorKey));
  const authors = [...snapshot.authors];
  for (const blocked of preferences.pr.blockedAuthors) {
    if (!authors.some(author => authorKey(author.name) === authorKey(blocked))) authors.push({ name: blocked, threads: 0, blocked: true });
  }
  async function addAuthor() {
    const value = name.trim();
    if (!isAuthorName(value)) { setNameError('Enter a display name.'); return; }
    if (blockedKeys.has(authorKey(value))) { setNameError('Already blocked.'); return; }
    if (await update({ kind: 'pr-author', name: value, blocked: true })) setName('');
  }
  return <section className="board-settings" aria-label="Pull request customization">
    <UnderlinePanels aria-label="Pull request settings" className="ticket-tabs" value={tab}
      onChange={({ value }) => setTab(value === 'files' || value === 'tabs' || value === 'blocked' ? value : 'overview')}>
      <UnderlinePanels.Tab value="overview">Overview</UnderlinePanels.Tab>
      <UnderlinePanels.Tab value="files">Files</UnderlinePanels.Tab>
      <UnderlinePanels.Tab value="tabs">Tabs</UnderlinePanels.Tab>
      <UnderlinePanels.Tab value="blocked">Blocked</UnderlinePanels.Tab>
      <UnderlinePanels.Panel value="overview">
        {PR_FEATURE_IDS.filter(feature => PR_FEATURES[feature].tab === 'overview').map(row)}
      </UnderlinePanels.Panel>
      <UnderlinePanels.Panel value="files">
        {PR_FEATURE_IDS.filter(feature => PR_FEATURES[feature].tab === 'files').map(row)}
      </UnderlinePanels.Panel>
      <UnderlinePanels.Panel value="tabs">
        <section aria-label="Visible pull request tabs">
          {pageTabs.map(item => tabRow(item.id, item.label, item.selected ? 'current' : undefined))}
          {savedOnly.map(tabId => tabRow(tabId, tabId, 'not on this PR'))}
          {!pageTabs.length && !savedOnly.length && <Text as="p" className="caption">Open a pull request to list its tabs.</Text>}
          <Text as="p" className="caption">The tab you are on always stays visible.</Text>
        </section>
      </UnderlinePanels.Panel>
      <UnderlinePanels.Panel value="blocked">
        <section aria-label="Blocked comment authors">
          <form className="pr-author-form" onSubmit={event => { event.preventDefault(); void addAuthor(); }}>
            <TextInput size="small" aria-label="Author display name" placeholder="Display name" value={name}
              validationStatus={nameError ? 'error' : undefined} onChange={event => { setName(event.target.value); setNameError(''); }} />
            <Button size="small" type="submit" disabled={saving}>Block</Button>
          </form>
          {nameError && <Text className="caption" role="alert">{nameError}</Text>}
          {authors.map((author, index) => (
            <div className="ticket-row" key={authorKey(author.name)}>
              <div className="pr-list-label"><Text id={`${id}-author-${index}`} title={author.name}>{author.name}</Text>
                <Text className="caption">{author.threads ? `${author.threads} ${author.threads === 1 ? 'thread' : 'threads'}` : 'not seen yet'}</Text></div>
              <ToggleSwitch size="small" aria-labelledby={`${id}-author-${index}`} checked={blockedKeys.has(authorKey(author.name))}
                disabled={saving} onChange={value => void update({ kind: 'pr-author', name: author.name, blocked: value })} />
            </div>
          ))}
          <Text as="p" className="caption">Threads started by a blocked author fold away. Matching uses the display name. Authors appear here as their threads load; switch the activity filter to Show everything to list them all.</Text>
        </section>
      </UnderlinePanels.Panel>
    </UnderlinePanels>
    {snapshot.message ? <Flash role="alert" variant={snapshot.status === 'error' ? 'danger' : 'warning'}>{snapshot.message}
      {snapshot.unsupported.length > 0 && ` Not found: ${snapshot.unsupported.map(feature => PR_FEATURES[feature].title).join(', ')}.`}</Flash> :
      <Text as="p" className="caption" role="status">{status(snapshot)}</Text>}
  </section>;
}
