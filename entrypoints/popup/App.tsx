import { useEffect, useId, useRef, useState } from 'react';
import {
  ActionList, ActionMenu, BaseStyles, Button, Flash, FormControl, Heading,
  IconButton, SegmentedControl, Select, Spinner, Text, TextInput,
  ToggleSwitch, VisuallyHidden,
} from '@primer/react';
import { ThemeProvider } from '@primer/react/next';
import {
  ArrowLeftIcon, GearIcon, InfoIcon, LockIcon,
  MoonIcon, PlusIcon, ProjectIcon, SlidersIcon,
  SunIcon, SyncIcon, UndoIcon, UnlockIcon,
} from '@primer/octicons-react';
import { scopeKey, type Scope } from '@/lib/context';
import { extensionVersion } from '@/lib/extension';
import {
  BUILTIN_PRESETS, TICKET_BUILTIN_PRESETS, defaultView, type Preset,
} from '@/lib/preferences';
import { usePreferences } from '@/lib/use-preferences';
import { SaveFeedback } from '@/lib/save-feedback';
import { useInspector, type InspectorState } from '@/lib/use-inspector';
import { useTicket } from '@/lib/use-ticket';
import { useBoard } from '@/lib/use-board';
import type { TicketArea } from '@/lib/ticket';
import { LibraryPanel } from './LibraryPanel';
import { TicketPanel } from './TicketPanel';
import { LayoutDiagnosticsPanel } from './LayoutDiagnosticsPanel';
import { ConfigurationPanel } from './ConfigurationPanel';
import { Help } from './Help';
import './App.css';

const SCOPES: { value: Scope; title: string }[] = [
  { value: 'all', title: 'All ADO' },
  { value: 'organization', title: 'This org' },
  { value: 'project', title: 'This project' },
  { value: 'board', title: 'This board' },
];

function inspectorLabel(state: InspectorState): { label: string; detail: string } {
  if (state.status === 'loading') return { label: 'Reading page...', detail: 'Read-only inspection in progress.' };
  if (state.status === 'paused') return { label: 'Inspector paused', detail: 'Turn the extension on to read this page.' };
  if (state.status === 'unsupported') return { label: 'Open an ADO tab', detail: 'Supported sites: dev.azure.com and *.visualstudio.com.' };
  if (state.status === 'error') return { label: 'Inspection failed', detail: state.message };
  const result = state.inspection;
  if (result.kind === 'unsupported') return { label: 'Not a work item view', detail: 'Open Boards, Backlogs, Sprints, query results, or Work items.' };
  if (result.kind === 'unrecognized') return { label: 'View not recognized', detail: 'No supported work item surface was found. Open inspection details to copy diagnostics.' };
  const tickets = result.unidentifiedItems === 0;
  const items = result.kind === 'cards' ? 'Cards' : result.kind === 'rows' ? 'Rows' : 'Items';
  return {
    label: `${tickets ? 'Tickets' : items} loaded: ${tickets ? result.uniqueTickets : result.renderedItems}`,
    detail: `${result.uniqueTickets} distinct ticket IDs in ${result.renderedItems} loaded items. This is not the total. Updated ${new Date(result.scannedAt).toLocaleTimeString()}.`,
  };
}

export default function App() {
  const { preferences, error, update, reset, saveState, saving, dismissSave } = usePreferences();
  const { context, state: inspector, refresh } = useInspector(preferences?.enabled ?? false, preferences !== null);
  const { snapshot: ticket, refresh: refreshTicket } = useTicket(preferences !== null);
  const { snapshot: board, refresh: refreshBoard, retryAutoLoad } = useBoard(preferences !== null);
  useEffect(() => {
    if (board.autoLoad.status === 'complete' && board.autoLoad.batches > 0) void refresh();
  }, [board.autoLoad.status, board.autoLoad.batches, board.autoLoad.itemsSeen, refresh]);
  const [area, setArea] = useState<TicketArea>('library');
  const lastTicket = useRef<string | null>(null);
  useEffect(() => {
    if (ticket.token !== lastTicket.current) {
      if (ticket.token) setArea('ticket');
      else if (lastTicket.current) setArea('library');
      lastTicket.current = ticket.token;
    }
  }, [ticket.token]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [savePresetId, setSavePresetId] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [copyError, setCopyError] = useState('');
  const presetButton = useRef<HTMLButtonElement>(null);
  const masterLabel = useId();

  const key = preferences ? scopeKey(preferences.scope, context) : null;
  const view = key && preferences ? preferences.views[key] ?? defaultView() : defaultView();
  const savedBank = area === 'ticket' ? preferences?.ticket.savedPresets ?? [] : preferences?.savedPresets ?? [];
  const presets = [...(area === 'ticket' ? TICKET_BUILTIN_PRESETS : BUILTIN_PRESETS), ...savedBank];
  const base = presets.find(preset => preset.id === (area === 'ticket' ? preferences?.ticket.presetId : view.presetId));
  const custom = area === 'ticket' ? Boolean(base?.ticket && preferences &&
    (JSON.stringify(base.ticket.hiddenTargets) !== JSON.stringify(preferences.ticket.hiddenTargets) ||
      JSON.stringify(base.ticket.cardLayouts) !== JSON.stringify(preferences.ticket.cardLayouts) ||
      base.ticket.viewMode !== preferences.ticket.viewMode ||
      JSON.stringify(base.ticket.workspaceLayouts) !== JSON.stringify(preferences.ticket.workspaceLayouts))) :
    Boolean(base?.board && JSON.stringify(view.board ?? defaultView().board) !== JSON.stringify(base.board));
  const available = area === 'ticket' || Boolean(key);
  const count = inspectorLabel(inspector);
  const version = extensionVersion();
  const diagnostics = JSON.stringify({
    extension: 'ADOverride',
    version,
    status: inspector.status,
    view: context?.pageKind ?? 'not-ado',
    ...(inspector.status === 'error' ? { error: inspector.message.replace(/\b(?:https?|file|chrome-extension):\/\/[^\s"'<>]+/gi, '[redacted URL]') } : {}),
    ...(inspector.status === 'ready' ? {
      connection: inspector.connection,
      surface: inspector.inspection.kind,
      renderedItems: inspector.inspection.renderedItems,
      uniqueTickets: inspector.inspection.uniqueTickets,
      unidentifiedItems: inspector.inspection.unidentifiedItems,
      hiddenItems: inspector.inspection.hiddenItems,
      matchedCards: inspector.inspection.matchedCards,
      matchedRows: inspector.inspection.matchedRows,
      matchedForms: inspector.inspection.matchedForms,
    } : {}),
    ticket: {
      viewMode: preferences?.ticket.viewMode ?? null,
      status: ticket.status,
      targets: ticket.targets.length,
      mapped: ticket.targets.filter(target => target.mounted).length,
      unsupported: ticket.targets.filter(target => target.override === 'unmapped').length,
      drag: ticket.drag ?? null,
      message: ticket.message?.replace(/\b(?:https?|file|chrome-extension):\/\/[^\s"'<>]+/gi, '[redacted URL]') ?? null,
    },
    board,
  }, null, 2);

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopyError('');
      setAnnouncement('Copied inspection diagnostics.');
    } catch (reason) {
      console.error('[ADOverride] Could not copy inspection diagnostics.', reason);
      setCopyError('Could not copy diagnostics. Select the text below and copy it manually.');
    }
  }

  async function applyPreset(preset: Preset) {
    const saved = await update({ kind: 'apply-preset', area, presetId: preset.id, viewKey: key ?? undefined });
    if (saved) {
      setMenuOpen(false);
      setAnnouncement(`${preset.name} ${area === 'ticket' ? 'Ticket' : 'Library'} preferences saved.`);
    }
  }

  function startSave() {
    setMenuOpen(false);
    setName('');
    setNameError('');
    setSavePresetId('');
    setSaveOpen(true);
  }

  async function savePreset() {
    const title = name.trim();
    if (!title) {
      setNameError('Enter a preset name.');
      return;
    }
    if (presets.some(preset => preset.id !== savePresetId && preset.name.toLowerCase() === title.toLowerCase())) {
      setNameError('A preset with this name already exists.');
      return;
    }
    if (!available) {
      setNameError('Open an ADO page to save this scope.');
      return;
    }
    const id = savePresetId || `saved:${crypto.randomUUID()}`;
    const saved = await update({ kind: 'save-preset', area, id, name: title, viewKey: key ?? undefined, replace: Boolean(savePresetId) });
    if (saved) {
      setSaveOpen(false);
      setAnnouncement(`Saved ${title}.`);
      presetButton.current?.focus();
    }
  }

  return (
    <ThemeProvider colorMode={preferences?.theme ?? 'light'} dayScheme="light" nightScheme="dark">
      <BaseStyles className="popup">
        {!preferences ? (
          <div className="startup">
            {error ? (
              <>
                <Flash variant="danger">{error}</Flash>
                <Button onClick={() => void reset()}>Reset stored preferences</Button>
              </>
            ) : <Spinner aria-label="Loading preferences" />}
          </div>
        ) : (
          <>
            <header className="popup-header">
              <span className="brand"><SlidersIcon size={18} /></span>
              <div className="brand-copy">
                <Heading as="h1" style={{ fontSize: 14 }}>ADOverride</Heading>
                <Text className="caption" data-extension-version={version}>v{version}</Text>
              </div>
              <IconButton
                size="small" variant="invisible"
                icon={preferences.theme === 'light' ? MoonIcon : SunIcon}
                aria-label={`Switch popup to ${preferences.theme === 'light' ? 'dark' : 'light'} theme`}
                onClick={() => void update({ kind: 'patch', theme: preferences.theme === 'light' ? 'dark' : 'light' })}
              />
              <VisuallyHidden id={masterLabel}>Enable ADOverride</VisuallyHidden>
              <ToggleSwitch
                size="small" aria-labelledby={masterLabel}
                checked={preferences.enabled}
                onChange={enabled => void update({ kind: 'patch', enabled })}
              />
            </header>

            <div className="area-tabs">
              <SegmentedControl size="small" fullWidth aria-label="Extension area"
                onChange={index => { setArea(index === 0 ? 'library' : 'ticket'); setSaveOpen(false); setDetailsOpen(false); setConfigurationOpen(false); }}>
                <SegmentedControl.Button selected={area === 'library'}>Library</SegmentedControl.Button>
                <SegmentedControl.Button selected={area === 'ticket'}>Ticket</SegmentedControl.Button>
              </SegmentedControl>
            </div>
            <div className="controls single">
              <div className="control-field">
                <div className="preset-actions">
                  <ActionMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <ActionMenu.Button
                      ref={presetButton} size="small" disabled={!available}
                      leadingVisual={custom ? SlidersIcon : ProjectIcon}
                      aria-label={`Choose preset, current ${custom ? 'Custom view' : base?.name ?? 'Unavailable'}`}
                    >
                      {custom ? 'Custom' : base?.name ?? 'Unavailable'}
                    </ActionMenu.Button>
                    <ActionMenu.Overlay width="small" align="start">
                      <ActionList selectionVariant="single">
                        <ActionList.Group>
                          <ActionList.GroupHeading>{area === 'ticket' ? 'Ticket presets (all Ticket types)' : 'Library presets'}</ActionList.GroupHeading>
                          {presets.map(preset => (
                            <ActionList.Item
                              key={preset.id}
                              selected={!custom && preset.id === base?.id}
                              disabled={area === 'ticket' ? !preset.ticket : !preset.board}
                              onSelect={() => void applyPreset(preset)}
                            >
                              <ActionList.LeadingVisual><ProjectIcon /></ActionList.LeadingVisual>
                              {preset.name}
                              {(area === 'ticket' ? !preset.ticket : !preset.board) && <ActionList.TrailingVisual>
                                <Text className="caption">{area === 'ticket' ? 'Library only' : 'Ticket only'}</Text>
                              </ActionList.TrailingVisual>}
                            </ActionList.Item>
                          ))}
                        </ActionList.Group>
                        <ActionList.Divider />
                        <ActionList.Item role="menuitem" onSelect={startSave}>
                          <ActionList.LeadingVisual><PlusIcon /></ActionList.LeadingVisual>
                          Save current as preset...
                        </ActionList.Item>
                        <ActionList.Item role="menuitem" onSelect={() => {
                          if (base) void applyPreset(base);
                        }}>
                          Restore selected preset
                        </ActionList.Item>
                      </ActionList>
                    </ActionMenu.Overlay>
                  </ActionMenu>
                  {custom && !saveOpen && <IconButton size="small" variant="invisible" icon={PlusIcon} aria-label="Save as preset" onClick={startSave} />}
                  {area === 'ticket' && <div className="ticket-history">
                    <IconButton size="small" icon={UndoIcon} aria-label="Undo last Ticket change" disabled={saving || !preferences.ticket.undo}
                      onClick={() => { if (preferences.ticket.undo) void update({ kind: 'undo-ticket', id: preferences.ticket.undo.id }); }} />
                    <IconButton size="small" className="lock-toggle" icon={preferences.ticket.layoutLocked ? LockIcon : UnlockIcon}
                      aria-label={preferences.ticket.layoutLocked ? 'Unlock layout' : 'Lock layout'}
                      description={preferences.ticket.layoutLocked ? 'Layout locked. Drag and hide buttons are off on the page.' :
                        'Lock the layout. Removes drag and hide buttons from the page; saved positions stay.'}
                      aria-pressed={preferences.ticket.layoutLocked} disabled={saving}
                      onClick={() => void update({ kind: 'ticket-layout-lock', locked: !preferences.ticket.layoutLocked })} />
                  </div>}
                  {area === 'library' && <div className="ticket-history">
                    <Select size="small" aria-label="Scope" value={preferences.scope}
                      onChange={event => {
                        const scope = SCOPES.find(item => item.value === event.target.value);
                        if (scope) void update({ kind: 'patch', scope: scope.value });
                      }}
                    >
                      {SCOPES.map(scope => <Select.Option key={scope.value} value={scope.value} disabled={scopeKey(scope.value, context) === null}>{scope.title}</Select.Option>)}
                    </Select>
                    <Help label="Scope" text="Where Library changes are saved. Board, project and organization settings override All ADO." />
                  </div>}
                </div>
              </div>
            </div>

            <main className="popup-body">
              {error && saveState.status !== 'error' && <Flash variant="danger" className="notice">{error}</Flash>}
              {inspector.status === 'error' && <Flash variant="warning" className="notice">{inspector.message}</Flash>}
              {configurationOpen ? <ConfigurationPanel preferences={preferences} saving={saving} update={update} onBack={() => setConfigurationOpen(false)} /> : detailsOpen ? (
                <section className="inspection-details">
                  <div className="save-heading">
                    <IconButton size="small" variant="invisible" icon={ArrowLeftIcon} aria-label="Back to feature library" onClick={() => setDetailsOpen(false)} />
                    <Heading as="h2" style={{ fontSize: 14 }}>Page inspection</Heading>
                  </div>
                  <Text className="caption">{count.detail}</Text>
                  <Button size="small" onClick={() => void copyDiagnostics()}>Copy diagnostics</Button>
                  {copyError && <Flash variant="warning">{copyError}</Flash>}
                  <LayoutDiagnosticsPanel available={Boolean(ticket.token)} boardAvailable={board.columns > 0} />
                  <pre className="diagnostics" aria-label="Inspection diagnostics">{diagnostics}</pre>
                  <Text className="caption">No ticket content, IDs, or page URLs are included.</Text>
                </section>
              ) : !available ? (
                <Flash variant="warning">Open an ADO page for this scope, or select All ADO.</Flash>
              ) : saveOpen ? (
                <form className="save-form" onSubmit={event => { event.preventDefault(); void savePreset(); }}>
                  <div className="save-heading">
                    <IconButton size="small" variant="invisible" icon={ArrowLeftIcon} aria-label="Back to feature library" onClick={() => {
                      setSaveOpen(false);
                      presetButton.current?.focus();
                    }} />
                    <Heading as="h2" style={{ fontSize: 14 }}>Save a preset</Heading>
                  </div>
                  <FormControl required>
                    <FormControl.Label>Preset name</FormControl.Label>
                    <TextInput autoFocus block value={name} placeholder="My daily view" validationStatus={nameError ? 'error' : undefined}
                      onChange={event => { setName(event.target.value); setNameError(''); }} />
                    {nameError ? <FormControl.Validation variant="error">{nameError}</FormControl.Validation> :
                      <FormControl.Caption>Saved locally in your browser.</FormControl.Caption>}
                  </FormControl>
                  <FormControl>
                    <FormControl.Label>Save into</FormControl.Label>
                    <Select block value={savePresetId} onChange={event => {
                      setSavePresetId(event.target.value);
                      const existing = savedBank.find(preset => preset.id === event.target.value);
                      if (existing) setName(existing.name);
                    }}>
                      <Select.Option value="">New preset</Select.Option>
                      {savedBank.map(preset => <Select.Option key={preset.id} value={preset.id}>{preset.name}</Select.Option>)}
                    </Select>
                    <FormControl.Caption>Saved in {area === 'ticket' ? 'Ticket' : 'Library'} presets only.</FormControl.Caption>
                  </FormControl>
                  <Button type="submit" size="small" variant="primary">Save preset</Button>
                </form>
              ) : area === 'ticket' ? <TicketPanel snapshot={ticket} preferences={preferences} saving={saving} update={update} /> :
                key ? <LibraryPanel view={view} viewKey={key} snapshot={board} saving={saving} update={update} retryAutoLoad={retryAutoLoad} /> : null}
            </main>

            {saveState.status !== 'idle' && <div className="save-feedback"><SaveFeedback
              state={{ ...saveState, undoId: saveState.undoId === preferences.ticket.undo?.id ? saveState.undoId : null }}
              onUndo={id => void update({ kind: 'undo-ticket', id })} onDismiss={dismissSave} /></div>}
            <footer className="popup-footer">
              <Text className="caption" title={count.detail} data-inspector-state={inspector.status} aria-live="polite">{count.label}</Text>
              <div className="footer-actions">
                <IconButton size="small" variant="invisible" icon={GearIcon} aria-label="Configuration" aria-pressed={configurationOpen}
                  onClick={() => { setConfigurationOpen(previous => !previous); setDetailsOpen(false); setSaveOpen(false); }} />
                <IconButton size="small" variant="invisible" icon={InfoIcon} aria-label="Inspection details"
                  aria-pressed={detailsOpen} onClick={() => { setDetailsOpen(previous => !previous); setConfigurationOpen(false); }} />
                <IconButton size="small" variant="invisible" icon={SyncIcon} aria-label="Refresh ticket count"
                  disabled={!preferences.enabled || inspector.status === 'loading'}
                  onClick={() => { void refresh(); refreshTicket(); refreshBoard(); }} />
              </div>
            </footer>
            <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
          </>
        )}
      </BaseStyles>
    </ThemeProvider>
  );
}
