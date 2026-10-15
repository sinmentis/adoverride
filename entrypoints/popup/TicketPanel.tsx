import { useId, useState } from 'react';
import { Button, Flash, FormControl, Radio, RadioGroup, Spinner, Text, TextInput, ToggleSwitch, VisuallyHidden } from '@primer/react';
import { UnderlinePanels } from '@primer/react/experimental';
import { ChevronDownIcon, ChevronRightIcon, SearchIcon, SyncIcon } from '@primer/octicons-react';
import type { PreferenceAction, Preferences } from '@/lib/preferences';
import type { TargetState, TicketSnapshot } from '@/lib/ticket';
import { Help } from './Help';

export function TicketPanel({ snapshot, preferences, saving, update }: {
  snapshot: TicketSnapshot; preferences: Preferences; saving: boolean; update: (action: PreferenceAction) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'layout' | 'cards'>('cards');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const search = query.trim().toLowerCase();
  const matches = new Set(snapshot.targets.filter(target => target.label.toLowerCase().includes(search)).map(target => target.id));
  if (search) for (const target of snapshot.targets) {
    if (!matches.has(target.id)) continue;
    let parentId = target.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId); matches.add(parentId);
      parentId = snapshot.targets.find(parent => parent.id === parentId)?.parentId ?? null;
    }
  }
  function toggleExpanded(id: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function rows(parentId: string | null, depth = 0) {
    return snapshot.targets.filter(target => target.parentId === parentId && (!search || matches.has(target.id))).map(target => {
      const children = snapshot.targets.filter(child => child.parentId === target.id);
      const open = search.length > 0 || expanded.has(target.id);
      return (
        <section key={target.id} className="ticket-group" style={{ marginLeft: depth ? 8 : 0 }}>
          <div className="ticket-row">
            {children.length ? <Button size="small" variant="invisible" alignContent="start"
              leadingVisual={open ? ChevronDownIcon : ChevronRightIcon} aria-expanded={open}
              onClick={() => toggleExpanded(target.id)}>{target.label}</Button> : <Text>{target.label}</Text>}
            <TargetToggle target={target} loading={snapshot.status === 'loading'} update={update} />
          </div>
          {(target.protected || !target.available || target.override === 'active-page' || target.override === 'validation' ||
            target.override === 'parent-hidden' || target.override === 'empty' || (!target.mounted && target.kind !== 'page')) && (
            <Text className="caption ticket-status">
              {target.protected ? 'Always visible' : !target.available ? 'Unavailable in this layout' :
                target.override === 'active-page' ? 'Will hide after leaving this page' :
                  target.override === 'validation' ? 'Shown for validation' :
                    target.override === 'parent-hidden' ? 'Hidden by parent' :
                      target.override === 'empty' ? 'All mapped fields are hidden' : 'Applies when mapped or loaded'}
            </Text>
          )}
          {children.length > 0 && open && rows(target.id, depth + 1)}
        </section>
      );
    });
  }
  const workspace = preferences.ticket.viewMode === 'workspace';
  const hidden = snapshot.targets.filter(target => !target.desiredVisible).length;
  return (
    <>
      {snapshot.message && <Flash variant={snapshot.status === 'error' ? 'danger' : 'warning'} className="notice">{snapshot.message}</Flash>}
      {snapshot.status === 'loading' && <Spinner size="small" aria-label="Loading Ticket layout" />}
      <UnderlinePanels aria-label="Ticket settings" className="ticket-tabs" value={tab}
        onChange={({ value }) => setTab(value === 'layout' ? 'layout' : 'cards')}>
        <UnderlinePanels.Tab value="layout">Layout</UnderlinePanels.Tab>
        <UnderlinePanels.Tab value="cards" counter={hidden ? `${hidden} hidden` : undefined}>Cards &amp; fields</UnderlinePanels.Tab>
        <UnderlinePanels.Panel value="layout">
          <RadioGroup name="ticket-view" className="ticket-view" disabled={saving}
            onChange={value => { if (value) void update({ kind: 'ticket-view', viewMode: value === 'workspace' ? 'workspace' : 'native' }); }}>
            <RadioGroup.Label className="section-title">View</RadioGroup.Label>
            <FormControl>
              <Radio value="native" checked={!workspace} />
              <FormControl.Label>Original</FormControl.Label>
              <FormControl.Caption>ADO&apos;s own arrangement</FormControl.Caption>
            </FormControl>
            <FormControl>
              <Radio value="workspace" checked={workspace} />
              <FormControl.Label>Workspace</FormControl.Label>
              <FormControl.Caption>Reading lane and Properties rail</FormControl.Caption>
            </FormControl>
          </RadioGroup>
          <div className="label-with-help">
            <Button size="small" leadingVisual={SyncIcon} disabled={saving}
              onClick={() => void update({ kind: 'reset-ticket-layout' })}>
              Reset {workspace ? 'Workspace' : 'original'} positions
            </Button>
            <Help label="Reset positions" text={`Moves cards back to their ${workspace ? 'Workspace' : 'original'} places. Hidden items stay hidden and the other view keeps its positions.`} />
          </div>
        </UnderlinePanels.Panel>
        <UnderlinePanels.Panel value="cards">
          <div className="ticket-search">
            <TextInput size="small" block leadingVisual={SearchIcon} type="search"
              aria-label="Find a Ticket card or field" placeholder="Find a card or field..." value={query}
              onChange={event => setQuery(event.target.value)} />
            <Button size="small" variant="invisible" disabled={saving} onClick={() => void update({ kind: 'reset-ticket' })}>Show all</Button>
          </div>
          {snapshot.status === 'none' ? <Text as="p" className="caption">Open a ticket page or dialog to discover its layout.</Text> :
            snapshot.targets.length ? rows(null) : <Text as="p" className="caption">No supported form structure is available.</Text>}
          {search && !matches.size && <Text as="p" className="caption">No matching cards or fields.</Text>}
        </UnderlinePanels.Panel>
      </UnderlinePanels>
    </>
  );
}

function TargetToggle({ target, loading, update }: { target: TargetState; loading: boolean; update: (action: PreferenceAction) => Promise<boolean> }) {
  const label = useId();
  return (
    <>
      <VisuallyHidden id={label}>Show {target.label}</VisuallyHidden>
      <ToggleSwitch size="small" aria-labelledby={label} checked={target.desiredVisible}
        disabled={target.protected || !target.available || loading && (!target.mounted || !target.fieldRef)}
        onChange={checked => void update({ kind: 'ticket-target', key: target.key, hidden: !checked })} />
    </>
  );
}
