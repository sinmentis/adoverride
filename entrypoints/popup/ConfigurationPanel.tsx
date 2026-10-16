import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { Button, Flash, Heading, IconButton, Spinner, Text } from '@primer/react';
import { ArrowLeftIcon, DownloadIcon, UploadIcon } from '@primer/octicons-react';
import { CONFIGURATION_BACKUP_KEY, decodeConfigurationBackup, exportConfiguration, parseConfiguration,
  type Configuration, type ConfigurationBackup } from '@/lib/configuration';
import { configurationBackup, extensionVersion } from '@/lib/extension';
import { MAX_CONFIGURATION_BYTES, type PreferenceAction, type Preferences } from '@/lib/preferences';
import { Help } from './Help';

interface Preview {
  configuration: Configuration;
  expectedRevision: number;
  name: string;
  backupId: string | null;
}
export function ConfigurationPanel({ preferences, saving, update, onBack }: {
  preferences: Preferences; saving: boolean; update: (action: PreferenceAction) => Promise<boolean>; onBack: () => void;
}) {
  const [backup, setBackup] = useState<ConfigurationBackup | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const reads = useRef(0);
  useEffect(() => {
    let active = true;
    let changed = false;
    void configurationBackup().then(value => { if (active && !changed) setBackup(value); }).catch(reason => {
      console.error('[ADOverride] Could not read configuration backup.', reason);
      if (active) setError(reason instanceof Error ? reason.message : 'Could not read configuration backup.');
    });
    const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !changes[CONFIGURATION_BACKUP_KEY]) return;
      changed = true;
      try {
        const value: unknown = changes[CONFIGURATION_BACKUP_KEY].newValue;
        setBackup(value === undefined ? null : decodeConfigurationBackup(value));
      } catch (reason) {
        console.error('[ADOverride] Invalid configuration backup.', reason);
        setError(reason instanceof Error ? reason.message : 'Invalid configuration backup.');
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => { active = false; reads.current++; browser.storage.onChanged.removeListener(listener); };
  }, []);
  const stale = Boolean(preview && (preview.expectedRevision !== preferences.revision || preview.backupId && preview.backupId !== backup?.id));

  function download() {
    setError(''); setMessage('');
    try {
      const text = JSON.stringify(exportConfiguration(preferences), null, 2);
      if (new TextEncoder().encode(text).byteLength > MAX_CONFIGURATION_BYTES) throw new Error('Configuration exceeds the 2 MB limit.');
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `adoverride-config-${extensionVersion()}-${Date.now()}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Configuration downloaded.');
    } catch (reason) {
      console.error('[ADOverride] Could not export configuration.', reason);
      setError(reason instanceof Error ? reason.message : 'Could not export configuration.');
    }
  }
  async function select(file: File) {
    const request = ++reads.current;
    const revision = preferences.revision;
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try {
      if (file.size > MAX_CONFIGURATION_BYTES) throw new Error('Configuration exceeds the 2 MB limit.');
      const configuration = parseConfiguration(await file.text());
      if (request === reads.current) setPreview({ configuration, expectedRevision: revision, name: file.name, backupId: null });
    } catch (reason) {
      console.error('[ADOverride] Could not read configuration file.', reason);
      if (request === reads.current) setError(reason instanceof Error ? reason.message : 'Could not read configuration file.');
    } finally { if (request === reads.current) setBusy(false); }
  }
  async function apply() {
    if (!preview) return;
    const action: PreferenceAction = preview.backupId ? { kind: 'restore-configuration', backupId: preview.backupId, expectedRevision: preview.expectedRevision } :
      { kind: 'replace-configuration', preferences: preview.configuration.preferences, expectedRevision: preview.expectedRevision };
    if (await update(action)) setPreview(null);
  }
  const disabled = busy || saving;
  return <section className="configuration-panel">
    <div className="save-heading">
      <IconButton size="small" variant="invisible" icon={ArrowLeftIcon} aria-label="Back from configuration" onClick={onBack} />
      <Heading as="h2" style={{ fontSize: 14 }}>Configuration</Heading>
      <Help label="Configuration" text="Files include presets and saved scopes, not ticket text or field values. Review before sharing." />
    </div>
    <div className="configuration-actions">
      <Button size="small" leadingVisual={DownloadIcon} disabled={disabled} onClick={download}>Export JSON</Button>
      <Button size="small" leadingVisual={UploadIcon} disabled={disabled} onClick={() => fileInput.current?.click()}>Import JSON...</Button>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Configuration JSON file"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void select(file);
        }} />
    </div>
    {busy && <Spinner size="small" aria-label="Reading configuration" />}
    {error && <Flash variant="danger" role="alert">{error}</Flash>}
    {message && <Text className="caption" role="status">{message}</Text>}
    {preview ? <>
      <Text style={{ fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>{preview.name}</Text>
      <table className="configuration-summary" aria-label="Configuration preview">
        <thead><tr><th>Setting</th><th>Current</th><th>Incoming</th></tr></thead>
        <tbody>{[
          ['Hidden rules', preferences.ticket.hiddenTargets.length, preview.configuration.preferences.ticket.hiddenTargets.length],
          ['Arranged pages', Object.keys(preferences.ticket.cardLayouts).length, Object.keys(preview.configuration.preferences.ticket.cardLayouts).length],
          ['Workspace pages', Object.keys(preferences.ticket.workspaceLayouts).length, Object.keys(preview.configuration.preferences.ticket.workspaceLayouts).length],
          ['Ticket view', preferences.ticket.viewMode, preview.configuration.preferences.ticket.viewMode],
          ['Ticket presets', preferences.ticket.savedPresets.length, preview.configuration.preferences.ticket.savedPresets.length],
          ['Library presets', preferences.savedPresets.length, preview.configuration.preferences.savedPresets.length],
          ['PR options on', Object.values(preferences.pr).filter(Boolean).length, Object.values(preview.configuration.preferences.pr).filter(Boolean).length],
          ['Library scopes', Object.keys(preferences.views).length, Object.keys(preview.configuration.preferences.views).length],
          ['Equal-width scopes', Object.values(preferences.views).filter(view => view.board?.equalColumns).length,
            Object.values(preview.configuration.preferences.views).filter(view => view.board?.equalColumns).length],
          ['Auto-load scopes', Object.values(preferences.views).filter(view => view.board?.autoLoadItems).length,
            Object.values(preview.configuration.preferences.views).filter(view => view.board?.autoLoadItems).length],
          ['Compact-card scopes', Object.values(preferences.views).filter(view => view.board?.compactCards).length,
            Object.values(preview.configuration.preferences.views).filter(view => view.board?.compactCards).length],
          ['Compact-header scopes', Object.values(preferences.views).filter(view => view.board?.compactHeader).length,
            Object.values(preview.configuration.preferences.views).filter(view => view.board?.compactHeader).length],
          ['Hidden card fields', Object.values(preferences.views).reduce((count, view) =>
            count + Object.values(view.board?.cardFields ?? {}).filter(visible => !visible).length, 0),
            Object.values(preview.configuration.preferences.views).reduce((count, view) =>
              count + Object.values(view.board?.cardFields ?? {}).filter(visible => !visible).length, 0)],
          ['Theme', preferences.theme, preview.configuration.preferences.theme],
          ['Enabled', preferences.enabled ? 'On' : 'Off', preview.configuration.preferences.enabled ? 'On' : 'Off'],
          ['Layout lock', preferences.ticket.layoutLocked ? 'On' : 'Off', preview.configuration.preferences.ticket.layoutLocked ? 'On' : 'Off'],
        ].map(([name, current, incoming]) => <tr key={name}><th scope="row">{name}</th><td>{current}</td><td>{incoming}</td></tr>)}</tbody>
      </table>
      <Text className="caption">{preview.backupId ? 'Restores all settings.' :
        'Replaces all settings. Keeps a local backup.'} Clears Ticket Undo.</Text>
      {stale && <Flash variant="warning" role="alert">Settings or backup changed since this preview. Review again before replacing.</Flash>}
      <div className="configuration-actions">
        <Button size="small" variant="primary" disabled={disabled || stale} onClick={() => void apply()}>
          {preview.backupId ? 'Restore configuration' : 'Replace configuration'}
        </Button>
        <Button size="small" disabled={disabled} onClick={() => { reads.current++; setPreview(null); setError(''); }}>Cancel import</Button>
        {stale && <Button size="small" disabled={disabled || Boolean(preview.backupId && preview.backupId !== backup?.id)}
          onClick={() => setPreview({ ...preview, expectedRevision: preferences.revision })}>Review again</Button>}
      </div>
    </> : <>
      <Text className="caption">{backup ? 'Pre-import backup available.' : 'No pre-import backup.'}</Text>
      {backup && <Button size="small" disabled={disabled} onClick={() => {
        setError(''); setMessage('');
        setPreview({ configuration: backup.configuration, backupId: backup.id, expectedRevision: preferences.revision, name: 'Pre-import backup' });
      }}>Restore pre-import backup...</Button>}
    </>}
  </section>;
}
