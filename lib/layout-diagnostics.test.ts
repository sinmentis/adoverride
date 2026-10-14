import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayoutRecorder, decodeLayoutReply, LAYOUT_DURATION } from './layout-diagnostics';
import { domTicketLayout } from './ticket';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

function fixture() {
  document.body.innerHTML = `<div class="native-shell" style="display:flex;align-items:flex-start">
    <div class="work-item-form-page" data-work-item-id="39999999">
      <header><input data-field-name="System.Title" value="Private title and identity"></header>
      <div class="work-item-grid" style="width:100%">
        <div class="work-item-form-section" style="position:relative;flex:1">
          <div class="work-item-form-group work-item-39999999" id="private-ticket-id" data-ado-ticket-manual-card="0">
            <div class="work-item-form-collapsible-header">Description</div>
            <div class="work-item-form-control-wrapper">
              <div class="html-editor"><div contenteditable="true" class="rooster-editor"><p>Private rich-text draft</p></div></div>
              <input value="Private field value"><iframe src="https://private.example/secret"></iframe>
            </div>
          </div>
        </div>
      </div>
    </div></div>`;
  const root = document.querySelector<HTMLElement>('.work-item-form-page');
  const card = document.querySelector<HTMLElement>('.work-item-form-group');
  if (!root || !card) throw new Error('Missing recorder fixture.');
  return createLayoutRecorder(() => ({
    root, bindings: new Map([[card, { key: 'group:details/description', label: 'Description', kind: 'group' }]]),
    page: 'page:details', enabled: true, hiddenTargets: [],
    arrangements: { 'page:details': [['group:details/description'], [], []] },
  }));
}

describe('detailed native layout recording', () => {
  it('keeps readonly bodies and obsolete content-derived hiding keys out of catalog-backed reports', () => {
    document.body.innerHTML = `<div class="work-item-form-page"><div class="work-item-grid"><div class="work-item-form-group">
      <div class="work-item-form-collapsible-header">Description</div>
      <div class="work-item-form-control-wrapper"><div class="work-item-form-control-content-wrapper">
        <div class="rich-text-container"><div class="readonly"><p>PRIVATE_READONLY_BODY</p></div></div>
      </div></div></div></div></div>`;
    const root = document.querySelector<HTMLElement>('.work-item-form-page');
    const control = root?.querySelector<HTMLElement>('.work-item-form-control-wrapper');
    if (!root || !control) throw new Error('Missing readonly report fixture.');
    const field = domTicketLayout(root).targets.find(target => target.kind === 'field');
    expect(field?.label).toBe('Description');
    if (!field) throw new Error('Missing safe readonly field identity.');
    const recorder = createLayoutRecorder(() => ({
      root, bindings: new Map([[control, { key: field.key, label: field.label, kind: field.kind }]]),
      page: 'page:details', enabled: true,
      hiddenTargets: [field.key, 'field:label/details/description/private_readonly_body'],
      arrangements: {},
    }));
    try {
      const { report, summary } = recorder.exportReport();
      for (const encoded of [report, summary]) {
        expect(encoded).not.toContain('PRIVATE_READONLY_BODY');
        expect(encoded).not.toContain('private_readonly_body');
        expect(encoded).toContain(field.key);
        expect(JSON.parse(encoded).snapshots[0]).toMatchObject({
          hiddenTargets: [field.key], hiddenTargetCounts: { total: 2, recorded: 1, omitted: 1 },
        });
      }
    } finally { recorder.dispose(); }
  });

  it('captures layout constraints, editor boundaries, and schema identities without ticket values', () => {
    const recorder = fixture();
    try {
      recorder.start();
      recorder.snapshot('native');
      recorder.trace('drag-start', { key: 'group:details/description' });
      const { report, summary } = recorder.exportReport();
      expect(report).toContain('"flex"');
      expect(report).toContain('"offsetParent"');
      expect(report).toContain('"rooster-editor"');
      expect(report).toContain('"iframe"');
      expect(report).toContain('group:details/description');
      expect(report).toContain('"nativeReference": "System.Title"');
      expect(summary).toContain('"drag-start"');
      for (const value of ['Private title', 'Private rich-text', 'Private field', '39999999', 'private-ticket-id', 'private.example', '/secret']) {
        expect(report).not.toContain(value);
      }
      expect(decodeLayoutReply({ ok: true, report, summary })).toEqual({ report, summary });
    } finally { recorder.dispose(); }
  });

  it('records a bounded timeline and expires without leaking callbacks into a new recording', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'performance'] });
    const recorder = fixture();
    try {
      recorder.start();
      recorder.trace('save-ack');
      recorder.start();
      vi.advanceTimersByTime(200);
      expect(recorder.exportReport().report).not.toContain('after-save-100ms');
      for (let index = 0; index < 1000; index++) recorder.trace('mutation', { index });
      vi.advanceTimersByTime(LAYOUT_DURATION);
      const value: unknown = JSON.parse(recorder.exportReport().report);
      expect(value).toMatchObject({ status: 'complete', durationMs: LAYOUT_DURATION });
      expect(recorder.exportReport().report.match(/"type": "mutation"/g)?.length).toBeLessThanOrEqual(300);
      expect(value).toMatchObject({ recordedCounters: { mutation: 1000 } });
      const saved = recorder.exportReport().report;
      vi.advanceTimersByTime(10000);
      expect(JSON.parse(recorder.exportReport().report).frames).toEqual(JSON.parse(saved).frames);
    } finally { recorder.dispose(); }
  });

  it('rejects unavailable forms and invalid export envelopes explicitly', () => {
    const recorder = createLayoutRecorder(() => ({
      root: null, bindings: new Map(), page: null, enabled: true, hiddenTargets: [], arrangements: {},
    }));
    expect(() => recorder.start()).toThrow('Open an active ticket');
    expect(() => decodeLayoutReply({ ok: false, error: 'Reader unavailable' })).toThrow('Reader unavailable');
    expect(() => decodeLayoutReply({ ok: true, report: '{}', summary: '{}' })).toThrow('Invalid layout report');
    recorder.dispose();
  });

  it('prioritizes shell, navigation, and every card root before a large widget exhausts detail capture', () => {
    const recorder = fixture();
    const root = document.querySelector('.work-item-form-page');
    const grid = root?.querySelector('.work-item-grid');
    const firstCard = grid?.querySelector('.work-item-form-group');
    if (!(root instanceof HTMLElement) || !(grid instanceof HTMLElement) || !(firstCard instanceof HTMLElement)) throw new Error('Missing budget fixture.');
    const header = root.querySelector('header');
    header?.classList.add('work-item-form-header');
    const tabs = document.createElement('nav');
    tabs.className = 'wif-tabbar';
    tabs.innerHTML = '<button role="tab">Details</button>';
    root.insertBefore(tabs, grid);
    const large = document.createElement('div');
    for (let index = 0; index < 800; index++) large.append(document.createElement('span'));
    firstCard.append(large);
    for (const name of ['Planning', 'Development', 'Discussion', 'Acceptance Criteria']) {
      const card = document.createElement('div');
      card.className = 'work-item-form-group';
      const title = document.createElement('div');
      title.className = 'work-item-form-collapsible-header';
      title.textContent = name;
      card.append(title); grid.append(card);
    }
    try {
      const { report, summary } = recorder.exportReport();
      expect(JSON.parse(report)).toMatchObject({ snapshots: [{
        truncated: true, coverage: { shellTruncated: false, bodyTruncated: true, discoveredCards: 5, capturedCards: 5 },
      }] });
      expect(report).toContain('"shell-header"');
      expect(summary).toContain('"navigation"');
      expect(report).not.toContain('Private title and identity');
      const nodes = JSON.parse(report).snapshots[0].nodes;
      expect(nodes.length).toBeLessThanOrEqual(600);
      expect(nodes.filter((node: { kind: string }) => node.kind === 'card')).toHaveLength(5);
    } finally { recorder.dispose(); }
  });
});
