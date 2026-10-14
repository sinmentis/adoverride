import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeTicketForm, decodeTicketSnapshot, decodeTicketVisibility, domTicketLayout, matchTicketLayout, normalizeProcessLayout, normalizeWebXml } from './ticket';
import { createMetadataProvider } from './ticket-metadata';
import { applyPreferenceAction, decodePreferences, defaultPreferences, defaultView } from './preferences';
import { nativePreferences } from '../tests/preferences-fixture';

const layout = {
  pages: [{ id: 'example.details', label: 'Details', pageType: 'custom', visible: true, sections: [{
    groups: [{ id: 'example.planning', label: 'Planning', controls: [
      { id: 'Microsoft.VSTS.Common.Priority', label: 'Priority', controlType: 'FieldControl' },
      { id: 'System.Title', label: 'Title', controlType: 'FieldControl' },
    ] }],
  }] }, { id: 'example.history', label: 'History', pageType: 'history', sections: [] }],
};

describe('Ticket contracts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      const rectangles = this.closest('[hidden]') ? [] : [new DOMRect(0, 0, 100, 100)];
      return Object.assign(rectangles, { item: (index: number) => rectangles[index] ?? null });
    });
  });
  it('normalizes stable global keys and protects identity fields', () => {
    const data = normalizeProcessLayout(layout);
    expect(data.targets.map(target => target.key)).toEqual([
      'page:details', 'group:details/planning', 'field:microsoft.vsts.common.priority', 'field:system.title', 'page:history',
    ]);
    expect(data.targets.find(target => target.fieldRef === 'System.Title')?.protected).toBe(true);
    expect(JSON.stringify(data)).not.toContain('field value');
  });
  it('uses contribution identities rather than translated widget labels', () => {
    const widget = normalizeProcessLayout({ pages: [{
      id: 'local-page-id', label: 'Translated widget', isContribution: true,
      contribution: { contributionId: 'Example.Extension.Page' }, sections: [{
        groups: [{ id: 'local-group', label: 'Translated group', isContribution: true,
          contribution: { contributionId: 'Example.Extension.Group' }, controls: [] }],
      }],
    }] });
    expect(widget.targets.map(target => target.key)).toEqual([
      'page:contribution/example.extension.page', 'group:contribution/example.extension.group',
    ]);
  });
  it('rejects legacy desktop XML and unsafe XML rather than calling them complete layouts', () => {
    expect(() => normalizeWebXml('<FORM><Layout /></FORM>')).toThrow('web form');
    expect(() => normalizeWebXml('<!DOCTYPE FORM><FORM />')).toThrow('Unsafe');
    expect(() => normalizeWebXml('<FORM>')).toThrow('Malformed');
    const data = normalizeWebXml(`<FORM><WebLayout><Page Label="Details"><Section><Group Label="Description">
      <Control FieldName="System.Description" Label="Description" Type="HtmlFieldControl" />
    </Group></Section></Page></WebLayout></FORM>`);
    expect(data.source).toBe('web-xml');
    expect(data.targets.some(target => target.key === 'field:system.description')).toBe(true);
  });
  it('selects the foreground dialog and rejects ambiguity', () => {
    document.body.innerHTML = `<div class="work-item-form-page"></div><div class="work-item-form-dialog"><div class="work-item-form-page"></div></div>`;
    expect(activeTicketForm(document)?.surface).toBe('dialog');
    document.body.insertAdjacentHTML('beforeend', '<div class="work-item-form-dialog"></div>');
    expect(() => activeTicketForm(document)).toThrow('Multiple');
  });
  it('validates visibility and response payloads', () => {
    expect(decodeTicketVisibility({ hiddenTargets: ['field:system.description', 'field:system.description'] }).hiddenTargets).toHaveLength(1);
    expect(() => decodeTicketVisibility({ hiddenTargets: ['arbitrary selector'] })).toThrow('Invalid');
    expect(() => decodeTicketSnapshot({ version: 1, targets: [] })).toThrow('Invalid');
  });
  it('migrates v1 without activating previews and retires old presets', () => {
    const legacy = {
      version: 1, readerEnabled: false, theme: 'dark', scope: 'all',
      views: { all: defaultView() },
      savedPresets: [{ id: 'legacy', name: 'Existing', appearance: defaultView().appearance }],
    };
    const result = decodePreferences(legacy);
    expect(result).toMatchObject({ version: 11, enabled: false, theme: 'dark', ticket: { presetId: 'ticket:kiwifruit', hiddenTargets: [] } });
    expect(result.savedPresets).toEqual([]);
    expect(decodePreferences(result)).toEqual(result);
  });
  it('saves and applies independent preset banks without touching the other area', () => {
    let settings = defaultPreferences();
    settings = applyPreferenceAction(settings, { kind: 'save-preset', area: 'library', id: 'daily', name: 'Daily', viewKey: 'all' });
    settings = applyPreferenceAction(settings, { kind: 'ticket-target', key: 'group:details/planning', hidden: true });
    settings = applyPreferenceAction(settings, { kind: 'save-preset', area: 'ticket', id: 'daily', name: 'Daily' });
    expect(settings.savedPresets[0]?.appearance).toEqual(defaultView().appearance);
    expect(settings.savedPresets[0]?.ticket).toBeUndefined();
    expect(settings.ticket.savedPresets[0]?.ticket?.hiddenTargets).toContain('group:details/planning');
    settings = applyPreferenceAction(settings, { kind: 'reset-ticket' });
    const before = settings.views;
    settings = applyPreferenceAction(settings, { kind: 'apply-preset', area: 'ticket', presetId: 'daily' });
    expect(settings.views).toEqual(before);
    expect(settings.ticket.hiddenTargets).toContain('group:details/planning');
    const ticket = settings.ticket;
    settings = applyPreferenceAction(settings, { kind: 'apply-preset', area: 'library', presetId: 'board:kiwifruit', viewKey: 'all' });
    expect(settings.ticket).toEqual(ticket);
    expect(settings.views.all?.board?.equalColumns).toBe(true);
  });
  it('preserves child rules when hiding and restoring a card', () => {
    let settings = nativePreferences();
    settings = applyPreferenceAction(settings, { kind: 'ticket-target', key: 'field:microsoft.vsts.common.priority', hidden: true });
    settings = applyPreferenceAction(settings, { kind: 'ticket-target', key: 'group:details/planning', hidden: true });
    settings = applyPreferenceAction(settings, { kind: 'ticket-target', key: 'group:details/planning', hidden: false });
    expect(settings.ticket.hiddenTargets).toEqual(['field:microsoft.vsts.common.priority']);
  });
  it('allows the same preset name in independent Ticket and Library banks', () => {
    let settings = defaultPreferences();
    settings = applyPreferenceAction(settings, { kind: 'save-preset', area: 'library', id: 'library-daily', name: 'Daily', viewKey: 'all' });
    expect(() => {
      settings = applyPreferenceAction(settings, { kind: 'save-preset', area: 'ticket', id: 'ticket-daily', name: 'Daily' });
    }).not.toThrow();
    expect(settings.savedPresets.find(preset => preset.id === 'ticket-daily')).toBeUndefined();
    expect(settings.ticket.savedPresets.find(preset => preset.id === 'ticket-daily')?.name).toBe('Daily');
  });
  it('migrates shared v2 visibility while clearing old template banks', () => {
    const value = {
      version: 2, enabled: true, theme: 'dark', scope: 'all', views: { all: defaultView() },
      savedPresets: [{ id: 'shared', name: 'Daily', appearance: defaultView().appearance,
        ticket: { hiddenTargets: ['group:details/planning'] } }],
      ticket: { presetId: 'shared', hiddenTargets: ['field:system.description'] },
    };
    const migrated = decodePreferences(value);
    expect(migrated.savedPresets).toEqual([]);
    expect(migrated.ticket.savedPresets).toEqual([]);
    expect(migrated.ticket.hiddenTargets).toEqual(['field:system.description']);
    expect(decodePreferences(migrated)).toEqual(migrated);
  });
  it('discovers the native page/card/field hierarchy without a type marker or metadata', () => {
    document.body.innerHTML = `<div class="work-item-form-page"><div class="wif-tabbar">
      <button role="tab" id="example.details" aria-selected="true">Details</button>
      <button role="tab" id="example.team">Team</button></div>
      <div class="work-item-form-group" id="example.planning"><h2 class="work-item-form-collapsible-header">Planning</h2>
      <div class="work-item-form-control-wrapper" data-field-name="Microsoft.VSTS.Common.Priority"><label>Priority</label><input value="Secret value"></div>
      </div></div>`;
    const root = document.querySelector<HTMLElement>('.work-item-form-page');
    if (!root) throw new Error('Missing form fixture.');
    const native = domTicketLayout(root);
    expect(native.targets.map(target => target.label)).toEqual(['Details', 'Team', 'Planning', 'Priority']);
    expect(native.targets.find(target => target.label === 'Priority')?.parentId).toBe(native.targets.find(target => target.label === 'Planning')?.id);
    expect(JSON.stringify(native)).not.toContain('Secret value');
    expect(matchTicketLayout(native, [normalizeProcessLayout(layout)])?.source).toBe('process');
    expect(matchTicketLayout(native, [normalizeProcessLayout(layout), normalizeProcessLayout(layout)])).toBeNull();
  });
  it('does not turn a readonly rich-text body into a field label or preference identity', () => {
    document.body.innerHTML = `<div class="work-item-form-page"><div class="work-item-form-group">
      <div class="work-item-form-collapsible-header">Description</div>
      <div class="work-item-form-control-wrapper"><div class="work-item-form-control-content-wrapper">
        <div class="html-editor"><div class="rooster-editor"><p>PRIVATE_READONLY_BODY</p></div></div>
      </div></div></div></div>`;
    const root = document.querySelector<HTMLElement>('.work-item-form-page');
    if (!root) throw new Error('Missing readonly label fixture.');
    const data = domTicketLayout(root);
    expect(JSON.stringify(data)).not.toContain('PRIVATE_READONLY_BODY');
    expect(data.targets.filter(target => target.kind === 'field').map(target => target.label)).toEqual(['Description']);
  });
  it('ignores labels inside native value content and does not guess labels for ambiguous controls', () => {
    document.body.innerHTML = `<div class="work-item-form-page">
      <div class="work-item-form-group"><div class="work-item-form-collapsible-header">Description</div>
        <div class="work-item-form-control-wrapper"><div class="work-item-form-control-content-wrapper">
          <div class="work-item-form-control-content show-markdown-preview"><label>PRIVATE_BODY_LABEL</label><p>PRIVATE_BODY_TEXT</p></div>
        </div></div>
      </div>
      <div class="work-item-form-group"><div class="work-item-form-collapsible-header">Custom properties</div>
        <div class="work-item-form-control-wrapper"><div class="work-item-form-control-content-wrapper"><div>PRIVATE_VALUE_ONE</div></div></div>
        <div class="work-item-form-control-wrapper"><div class="work-item-form-control-content-wrapper"><div>PRIVATE_VALUE_TWO</div></div></div>
      </div></div>`;
    const root = document.querySelector<HTMLElement>('.work-item-form-page');
    if (!root) throw new Error('Missing value-boundary fixture.');
    const catalog = domTicketLayout(root);
    expect(catalog.targets.filter(target => target.kind === 'field').map(target => target.label)).toEqual(['Description']);
    for (const privateText of ['PRIVATE_BODY_LABEL', 'PRIVATE_BODY_TEXT', 'PRIVATE_VALUE_ONE', 'PRIVATE_VALUE_TWO']) {
      expect(JSON.stringify(catalog)).not.toContain(privateText);
    }
  });
  it('loads inherited layouts using only credentialed metadata GETs', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push(String(input));
      expect(init?.method).toBe('GET');
      expect(init?.credentials).toBe('include');
      const body = String(input).includes('/workitemtypes/') ? { referenceName: 'Example.UserStory', xmlForm: '<FORM><Layout /></FORM>' } :
        String(input).includes('/projects/') ? { capabilities: { processTemplate: { templateTypeId: 'example-process' } } } : layout;
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    };
    const provider = createMetadataProvider(fetcher);
    const result = await provider.get('https://example.visualstudio.com/Platform/_workitems/edit/101', 'User Story', new AbortController().signal);
    expect(result.source).toBe('process');
    expect(calls).toHaveLength(3);
    expect(calls.some(url => /\/_workitems\/edit|\/workitems\/101/.test(url))).toBe(false);
    await provider.get('https://dev.azure.com/example/Platform/_workitems/edit/202', 'User Story', new AbortController().signal);
    expect(calls).toHaveLength(3);
  });
  it('reports permission failures instead of inventing a complete catalog', async () => {
    const fetcher: typeof fetch = async () => new Response('Denied', { status: 403 });
    await expect(createMetadataProvider(fetcher).get('https://dev.azure.com/example/Platform/_workitems/edit/101', 'Task', new AbortController().signal)).rejects.toThrow('403');
  });
});
