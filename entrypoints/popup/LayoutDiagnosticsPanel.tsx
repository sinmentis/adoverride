import { useState } from 'react';
import { Button, Flash, Text } from '@primer/react';
import { extensionVersion, requestLayoutDiagnostics } from '@/lib/extension';
import { isObject } from '@/lib/ticket';
import { Help } from './Help';

export function LayoutDiagnosticsPanel({ available, boardAvailable = false }: { available: boolean; boardAvailable?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  function installedReport(text: string) {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed)) throw new Error('Invalid layout report.');
    return JSON.stringify({ extension: 'ADOverride', extensionVersion: extensionVersion(), ...parsed }, null, 2);
  }
  async function run(action: 'start' | 'copy' | 'download' | 'board') {
    setBusy(true); setError('');
    try {
      const reply = await requestLayoutDiagnostics(action === 'board' ? 'board' : action === 'start' ? 'start' : 'export');
      const text = installedReport(reply.summary);
      setSummary(text);
      if (action === 'start') {
        setMessage('Recording for 15 seconds.');
      } else if (action === 'copy') {
        await navigator.clipboard.writeText(text);
        setMessage('Summary copied.');
      } else {
        const blob = new Blob([installedReport(reply.report)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ado-${action === 'board' ? 'board-' : ''}layout-${extensionVersion()}-${Date.now()}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage('Report downloaded.');
      }
    } catch (reason) {
      console.error('[ADOverride] Could not export layout diagnostics.', reason);
      setError(reason instanceof Error ? reason.message : 'Could not export layout diagnostics.');
    } finally { setBusy(false); }
  }
  return <section style={{ display: 'grid', gap: 6 }} aria-label="Detailed layout diagnostics">
    <div className="label-with-help"><Text style={{ fontWeight: 600, fontSize: 12 }}>Layout diagnostics</Text>
      <Help label="Layout diagnostics" text="Download local structure, CSS and geometry without text or field values. Ticket recording lasts 15 seconds; close the popup while using the form, then reopen to export." /></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {boardAvailable && !available && <Button size="small" disabled={busy} onClick={() => void run('board')}>Download Board layout</Button>}
      {available && <>
        <Button size="small" disabled={busy} onClick={() => void run('start')}>Record layout (15s)</Button>
        <Button size="small" disabled={busy} onClick={() => void run('copy')}>Copy layout summary</Button>
        <Button size="small" disabled={busy} onClick={() => void run('download')}>Download layout report</Button>
      </>}
    </div>
    {message && <Text className="caption" role="status">{message}</Text>}
    {error && <Flash variant="danger">{error}</Flash>}
    {summary && <details><summary style={{ fontSize: 12 }}>Layout summary text</summary>
      <pre className="diagnostics" aria-label="Detailed layout summary">{summary}</pre></details>}
  </section>;
}
