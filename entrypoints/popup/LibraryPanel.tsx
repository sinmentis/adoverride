import { useId, useState } from 'react';
import { Button, Flash, Text, ToggleSwitch } from '@primer/react';
import { UnderlinePanels } from '@primer/react/experimental';
import type { BoardSnapshot } from '@/lib/board';
import type { PreferenceAction, StoredView } from '@/lib/preferences';
import { Help } from './Help';
import { CARD_FIELDS, defaultBoardProfile, isBoardCardField } from '@/lib/board-profile';

export function LibraryPanel({ view, viewKey, snapshot, saving, update, retryAutoLoad }: {
  view: StoredView; viewKey: string; snapshot: BoardSnapshot; saving: boolean;
  update: (action: PreferenceAction) => Promise<boolean>;
  retryAutoLoad: () => void;
}) {
  const label = useId();
  const autoLabel = useId();
  const cardsLabel = useId();
  const headerLabel = useId();
  const [tab, setTab] = useState<'layout' | 'fields'>('layout');
  const profile = view.board ?? defaultBoardProfile();
  const fields = Object.keys(CARD_FIELDS).filter(isBoardCardField);
  const hidden = fields.filter(field => !profile.cardFields[field]).length;
  return <section className="board-settings" aria-label="Board customization">
    <UnderlinePanels aria-label="Board settings" className="ticket-tabs" value={tab}
      onChange={({ value }) => setTab(value === 'fields' ? 'fields' : 'layout')}>
    <UnderlinePanels.Tab value="layout">Board layout</UnderlinePanels.Tab>
    <UnderlinePanels.Tab value="fields" counter={hidden || undefined}>Card fields</UnderlinePanels.Tab>
    <UnderlinePanels.Panel value="layout">
    <fieldset className="settings-section">
    <legend>Layout</legend>
    <div className="ticket-row">
      <div className="label-with-help"><Text id={label}>Equal-width columns</Text>
        <Help label="Equal-width columns" text="Fill the Board width. Collapsed columns keep their native width; narrow windows scroll." /></div>
      <ToggleSwitch size="small" aria-labelledby={label} checked={view.board?.equalColumns ?? false} disabled={saving}
        onChange={equal => void update({ kind: 'board-columns', viewKey, equal })} />
    </div>
    <div className="ticket-row">
      <div className="label-with-help"><Text id={headerLabel}>Compact header</Text>
        <Help label="Compact header" text="Reduce header spacing and hide secondary navigation. Team, work item type and filters stay available." /></div>
      <ToggleSwitch size="small" aria-labelledby={headerLabel} checked={profile.compactHeader} disabled={saving}
        onChange={enabled => void update({ kind: 'board-presentation', viewKey, feature: 'compactHeader', enabled })} />
    </div>
    <div className="ticket-row">
      <div className="label-with-help"><Text id={cardsLabel}>Compact cards</Text>
        <Help label="Compact cards" text="Reduce padding and combine metadata rows. Native fonts, titles, controls and dragging stay intact." /></div>
      <ToggleSwitch size="small" aria-labelledby={cardsLabel} checked={profile.compactCards} disabled={saving}
        onChange={enabled => void update({ kind: 'board-presentation', viewKey, feature: 'compactCards', enabled })} />
    </div>
    </fieldset>
    <fieldset className="settings-section">
    <legend>Loading</legend>
    <div className="ticket-row">
      <div className="label-with-help"><Text id={autoLabel}>Auto-load all items</Text>
        <Help label="Auto-load all items" text="Load native batches under the current filters, in expanded columns only. Native result limits still apply. Large Boards may slow down." /></div>
      <ToggleSwitch size="small" aria-labelledby={autoLabel} checked={view.board?.autoLoadItems ?? false} disabled={saving}
        onChange={enabled => void update({ kind: 'board-autoload', viewKey, enabled })} />
    </div>
    </fieldset>
    {view.board === null && <Text className="caption">Inherited settings</Text>}
    {snapshot.message ? <Flash role="alert" variant={snapshot.status === 'error' ? 'danger' : 'warning'}>{snapshot.message}</Flash> :
      <Text as="p" className="caption" role="status">{snapshot.equalColumns ?
        `Equal widths. ${snapshot.expanded} expanded, ${snapshot.collapsed} collapsed.` :
        snapshot.status === 'original' || snapshot.status === 'active' ? `Original widths. ${snapshot.columns} columns.` :
          snapshot.status === 'paused' ? 'Customization paused.' : 'Open a Kanban Board.'}</Text>}
    {snapshot.autoLoad.status === 'error' ? <>
      <Flash variant="warning" role="alert">{snapshot.autoLoad.message}</Flash>
      <Button size="small" disabled={saving} onClick={retryAutoLoad}>Retry auto-loading</Button>
    </> : snapshot.autoLoad.status !== 'off' && <Text className="caption" aria-live="polite">{
      snapshot.autoLoad.status === 'complete' ? 'No more native batches.' :
        snapshot.autoLoad.status === 'paused' ? 'Auto-load paused.' :
          snapshot.autoLoad.status === 'waiting' ? 'Waiting for ADO...' : 'Loading more items...'
    }</Text>}
    </UnderlinePanels.Panel>
    <UnderlinePanels.Panel value="fields">
      <section aria-label="Visible card fields">
        {fields.map(field =>
          <div className="ticket-row" key={field}>
            <Text id={`${cardsLabel}-${field}`}>{CARD_FIELDS[field]}</Text>
            <ToggleSwitch size="small" aria-labelledby={`${cardsLabel}-${field}`} checked={profile.cardFields[field]}
              disabled={saving} onChange={visible => void update({ kind: 'board-card-field', viewKey, field, visible })} />
          </div>)}
      </section>
    </UnderlinePanels.Panel>
    </UnderlinePanels>
  </section>;
}
