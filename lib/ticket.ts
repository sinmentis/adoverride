export const TICKET_PORT = 'ado-customize/ticket/v2';
export const TICKET_VERSION = 2;
export const FORM_SELECTOR = '.work-item-form-dialog, .work-item-form-page';
export const GROUP_SELECTOR = '.work-item-form-group, .work-item-form-discussion';
export const CONTROL_SELECTOR = '.work-item-form-control-wrapper';
export const RICH_EDITOR_SELECTOR = '.html-editor,.rooster-editor,.markdown-editor-placeholder,[contenteditable]';

export type TicketArea = 'library' | 'ticket';
export type TargetKind = 'page' | 'group' | 'field' | 'region';
export type OverrideReason = 'protected' | 'active-page' | 'validation' | 'parent-hidden' | 'native-hidden' | 'unmapped' | 'disabled' | 'empty' | null;
export interface TicketVisibility { hiddenTargets: string[] }
export interface TicketTarget {
  id: string;
  key: string;
  label: string;
  kind: TargetKind;
  parentId: string | null;
  nativeId: string;
  fieldRef: string | null;
  available: boolean;
  protected: boolean;
  opaque: boolean;
}
export interface TargetState extends TicketTarget {
  mounted: boolean;
  desiredVisible: boolean;
  effectiveVisible: boolean;
  override: OverrideReason;
}
export interface TicketSnapshot {
  version: 2;
  token: string | null;
  revision: number;
  status: 'none' | 'loading' | 'ready' | 'partial' | 'error';
  surface: 'page' | 'dialog' | null;
  message: string | null;
  targets: TargetState[];
  drag?: DragDiagnostics;
}
export interface TicketLayout {
  targets: TicketTarget[];
  source: 'process' | 'web-xml' | 'dom';
}

export const emptyTicketVisibility = (): TicketVisibility => ({ hiddenTargets: [] });
export const emptyTicketSnapshot = (): TicketSnapshot => ({
  version: 2, token: null, revision: 0, status: 'none', surface: null, message: null, targets: [],
});

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}.`);
  return value;
}
export function normalizeLabel(label: string): string {
  return label.replace(/&(?=[a-z])/gi, '').replace(/\s+/g, ' ').replace(/[:*]\s*$/, '').trim().toLowerCase();
}
export function isTargetKey(value: unknown): value is string {
  return typeof value === 'string' && /^(page|group|field|region):[^ \r\n][^\r\n]*$/.test(value);
}
export function decodeTicketVisibility(value: unknown): TicketVisibility {
  if (!isObject(value) || !Array.isArray(value.hiddenTargets) || !value.hiddenTargets.every(isTargetKey)) {
    throw new Error('Invalid Ticket visibility preferences.');
  }
  return { hiddenTargets: [...new Set(value.hiddenTargets)].sort() };
}
export function isProtectedField(reference: string): boolean {
  return ['system.id', 'system.title', 'system.workitemtype', 'system.state'].includes(reference.toLowerCase());
}
export function pageKey(label: string, type?: string): string {
  const semantic = normalizeLabel(type && type !== 'custom' ? type : label);
  return `page:${semantic}`;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}.`);
  return value;
}
function uniqueTargets(targets: TicketTarget[]): TicketTarget[] {
  const ids = new Set<string>();
  for (const target of targets) {
    if (ids.has(target.id)) throw new Error('The form layout has duplicate control identities.');
    ids.add(target.id);
  }
  return targets;
}

function distinguishGroups(targets: TicketTarget[]): TicketTarget[] {
  const groups = targets.filter(target => target.kind === 'group');
  for (const group of groups) {
    const peers = groups.filter(peer => peer.parentId === group.parentId && peer.key === group.key);
    if (peers.length < 2) continue;
    const signatures = peers.map(peer => [...new Set(targets.filter(target => target.parentId === peer.id)
      .map(target => target.fieldRef ? `field:${target.fieldRef.toLowerCase()}` : `label:${normalizeLabel(target.label)}`))].sort().join('|'));
    if (signatures.some(signature => !signature) || new Set(signatures).size !== peers.length) continue;
    for (const [index, peer] of peers.entries()) {
      const previous = peer.key;
      peer.key = `${previous}@${encodeURIComponent(signatures[index] ?? '')}`;
      for (const child of targets.filter(target => target.parentId === peer.id && !target.fieldRef)) {
        for (const prefix of ['field:label/', 'region:']) {
          if (child.key.startsWith(`${prefix}${previous.slice(6)}/`)) {
            child.key = `${prefix}${peer.key.slice(6)}${child.key.slice(prefix.length + previous.length - 6)}`;
          }
        }
      }
    }
  }
  return targets;
}

export function normalizeProcessLayout(value: unknown): TicketLayout {
  if (!isObject(value)) throw new Error('Invalid process form layout.');
  const targets: TicketTarget[] = [];
  for (const entry of array(value.pages, 'form pages')) {
    if (!isObject(entry)) throw new Error('Invalid form page.');
    const nativeId = text(entry.id, 'page ID');
    const label = text(entry.label, 'page label');
    const contribution = isObject(entry.contribution) && typeof entry.contribution.contributionId === 'string' ?
      entry.contribution.contributionId : nativeId;
    const key = entry.isContribution === true ? `page:contribution/${contribution.toLowerCase()}` :
      pageKey(label, typeof entry.pageType === 'string' ? entry.pageType : undefined);
    const id = `page/${nativeId}`;
    targets.push({ id, key, label, kind: 'page', parentId: null, nativeId, fieldRef: null,
      available: entry.visible !== false, protected: false, opaque: entry.isContribution === true });
    for (const section of array(entry.sections ?? [], 'form sections')) {
      if (!isObject(section)) throw new Error('Invalid form section.');
      for (const group of array(section.groups ?? [], 'form groups')) {
        if (!isObject(group)) throw new Error('Invalid form group.');
        const groupNativeId = text(group.id, 'group ID');
        const groupLabel = text(group.label, 'group label');
        const groupId = `${id}/group/${groupNativeId}`;
        const groupContribution = isObject(group.contribution) && typeof group.contribution.contributionId === 'string' ?
          group.contribution.contributionId : groupNativeId;
        const groupKey = group.isContribution === true ? `group:contribution/${groupContribution.toLowerCase()}` :
          `group:${key.slice(5)}/${normalizeLabel(groupLabel)}`;
        targets.push({ id: groupId, key: groupKey, label: groupLabel, kind: 'group', parentId: id,
          nativeId: groupNativeId, fieldRef: null, available: group.visible !== false && entry.visible !== false,
          protected: false, opaque: group.isContribution === true });
        let index = 0;
        for (const control of array(group.controls ?? [], 'form controls')) {
          if (!isObject(control)) throw new Error('Invalid form control.');
          const nativeControlId = typeof control.id === 'string' ? control.id : '';
          const controlType = typeof control.controlType === 'string' ? control.controlType : '';
          const field = /^(Field|HtmlField|DateTime|WorkItemClassification|Identity|PlainText)Control$/i.test(controlType) && Boolean(nativeControlId);
          const controlLabel = typeof control.label === 'string' && control.label.trim() ? control.label : nativeControlId || groupLabel;
          targets.push({
            id: `${groupId}/control/${nativeControlId || index++}`,
            key: field ? `field:${nativeControlId.toLowerCase()}` : `region:${groupKey.slice(6)}/${normalizeLabel(controlLabel)}`,
            label: controlLabel, kind: field ? 'field' : 'region', parentId: groupId,
            nativeId: nativeControlId, fieldRef: field ? nativeControlId : null,
            available: control.visible !== false && group.visible !== false && entry.visible !== false,
            protected: field && isProtectedField(nativeControlId), opaque: control.isContribution === true,
          });
        }
      }
    }
  }
  return { targets: distinguishGroups(uniqueTargets(targets)), source: 'process' };
}

export function normalizeWebXml(xml: string): TicketLayout {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsafe XML form layout.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Malformed XML form layout.');
  const web = document.querySelector('WebLayout');
  if (!web) throw new Error('The type definition does not contain a web form layout.');
  const pages = [...web.querySelectorAll(':scope > Page')].map((page, pageIndex) => ({
    id: page.getAttribute('Id') ?? `xml-page-${pageIndex}`,
    label: page.getAttribute('Label') ?? 'Details',
    visible: page.getAttribute('Visible') !== 'false',
    sections: [{
      groups: [...page.querySelectorAll('Group')].map((group, groupIndex) => ({
        id: group.getAttribute('Id') ?? `xml-group-${groupIndex}`,
        label: group.getAttribute('Label') ?? 'Content',
        visible: group.getAttribute('Visible') !== 'false',
        controls: [...group.querySelectorAll(':scope > Control')].map(control => ({
          id: control.getAttribute('FieldName') ?? control.getAttribute('Name') ?? '',
          label: control.getAttribute('Label') ?? '',
          controlType: control.getAttribute('Type') ?? '',
          visible: control.getAttribute('Visible') !== 'false',
        })),
      })),
    }],
  }));
  for (const control of web.querySelectorAll('SystemControls > Control')) {
    const type = control.getAttribute('Type');
    const label = control.getAttribute('Label');
    if (label && ['WorkItemLogControl', 'LinksControl', 'AttachmentsControl'].includes(type ?? '')) {
      pages.push({ id: `system-${normalizeLabel(label)}`, label, visible: control.getAttribute('Visible') !== 'false', sections: [] });
    }
  }
  const layout = normalizeProcessLayout({ pages });
  return { ...layout, source: 'web-xml' };
}

export function rendered(element: Element): boolean {
  return !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0 &&
    element.ownerDocument.defaultView?.getComputedStyle(element).visibility !== 'hidden';
}
export function activeTicketForm(document: Document): { root: HTMLElement; surface: 'page' | 'dialog' } | null {
  const forms = [...document.querySelectorAll<HTMLElement>(FORM_SELECTOR)]
    .filter(form => !form.parentElement?.closest(FORM_SELECTOR) && rendered(form));
  const dialogs = forms.filter(form => form.matches('.work-item-form-dialog'));
  const candidates = dialogs.length ? dialogs : forms;
  if (candidates.length > 1) throw new Error('Multiple active ticket forms were found.');
  const root = candidates[0];
  return root ? { root, surface: dialogs.length ? 'dialog' : 'page' } : null;
}
export function workItemType(root: HTMLElement): string | null {
  const attribute = root.getAttribute('data-work-item-type') ?? root.querySelector('[data-work-item-type]')?.getAttribute('data-work-item-type');
  if (attribute?.trim()) return attribute.trim();
  const element = root.querySelector('.work-item-type-label, .work-item-type-name, .work-item-type-dropdown, [aria-label="Work Item Type"], [aria-label="Work item type"]');
  const name = element?.getAttribute('data-type-name') ?? element?.getAttribute('title') ?? element?.textContent;
  return name?.trim() || null;
}

export function nativeTicketTabs(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.wif-tabbar [id], .wif-tabbar [role="tab"], [role="tab"]')]
    .filter(element => (element.getAttribute('role') === 'tab' || element.matches('button, a, .bolt-tab, .tab')) &&
      !element.closest(`${GROUP_SELECTOR}, ${CONTROL_SELECTOR}`));
}
export function nativeTabLabel(tab: HTMLElement): string {
  const label = tab.getAttribute('aria-label') ?? tab.getAttribute('title') ?? tab.textContent;
  if (label?.trim()) return label.trim();
  const system = /System_(History|Links|Attachments|Info)$/i.exec(tab.id)?.[1];
  return system?.toLowerCase() === 'info' ? 'Details' : system ?? '';
}
function nativeFieldReference(control: HTMLElement): string | null {
  for (const node of [control, ...control.querySelectorAll('[data-field-name], [data-ref-name], [data-control-id]')]) {
    const reference = node.getAttribute('data-field-name') ?? node.getAttribute('data-ref-name') ?? node.getAttribute('data-control-id');
    if (reference && /^[a-z][\w-]*(?:\.[\w-]+)+$/i.test(reference)) return reference;
  }
  return null;
}
export function nativeControlLabel(control: HTMLElement): string | null {
  const label = [...control.querySelectorAll<HTMLElement>('.work-item-control-label, .workitemcontrol-label, label')]
    .find(element => element.closest(CONTROL_SELECTOR) === control &&
      !element.closest('.work-item-form-control-content, .work-item-form-control-value-parent, .html-editor, .rooster-editor, [contenteditable]'));
  const explicit = label?.textContent?.trim();
  if (explicit) return explicit;
  const group = control.closest<HTMLElement>(GROUP_SELECTOR);
  if (!group || group.querySelectorAll(CONTROL_SELECTOR).length !== 1) return null;
  return nativeGroupLabel(group);
}
export function nativeGroupHeader(group: HTMLElement): HTMLElement | null {
  const headers = [...group.querySelectorAll<HTMLElement>('.work-item-form-collapsible-header, [role="heading"]')]
    .filter(header => header.closest(GROUP_SELECTOR) === group &&
      !header.closest(`${CONTROL_SELECTOR},.work-item-form-control-content,.html-editor,.rooster-editor,[contenteditable],[role="textbox"],[data-ado-ticket-ui]`));
  return headers.find(header => header.matches('.work-item-form-collapsible-header')) ??
    (headers.length === 1 ? headers[0] ?? null : null);
}
export function nativeGroupLabel(group: HTMLElement): string | null {
  return nativeGroupHeader(group)?.textContent?.trim() || (group.matches('.work-item-form-discussion') ? 'Discussion' : null);
}
export function domTicketLayout(root: HTMLElement): TicketLayout {
  const targets: TicketTarget[] = [];
  const tabs = nativeTicketTabs(root);
  const seenPages = new Set<string>();
  for (const tab of tabs) {
    const label = nativeTabLabel(tab);
    if (!label) continue;
    const key = pageKey(label);
    if (seenPages.has(key)) continue;
    seenPages.add(key);
    targets.push({ id: `dom-${key}`, key, label, kind: 'page', parentId: null, nativeId: tab.id,
      fieldRef: null, available: true, protected: false, opaque: false });
  }
  if (!targets.length) targets.push({
    id: 'dom-page:details', key: 'page:details', label: 'Details', kind: 'page', parentId: null,
    nativeId: '', fieldRef: null, available: true, protected: false, opaque: false,
  });
  const selectedTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('selected'));
  const selectedPage = targets.find(target => target.key === pageKey(selectedTab ? nativeTabLabel(selectedTab) : 'Details')) ?? targets[0];
  if (!selectedPage) throw new Error('The native form has no identifiable page.');
  for (const group of root.querySelectorAll<HTMLElement>(GROUP_SELECTOR)) {
    if (group.parentElement?.closest(GROUP_SELECTOR)) continue;
    const label = nativeGroupLabel(group);
    if (!label) continue;
    const pageContainer = group.closest('[role="tabpanel"], [data-page-id]');
    const pageId = pageContainer?.getAttribute('data-page-id') ?? pageContainer?.getAttribute('aria-labelledby');
    const page = targets.find(target => target.kind === 'page' && pageId && target.nativeId === pageId) ?? selectedPage;
    const groupKey = `group:${page.key.slice(5)}/${normalizeLabel(label)}`;
    const occurrence = targets.filter(target => target.kind === 'group' && target.parentId === page.id && target.key === groupKey).length;
    const groupId = `${page.id}/group/${groupKey}/${occurrence}`;
    targets.push({ id: groupId, key: groupKey, label, kind: 'group',
      parentId: page.id, nativeId: group.id, fieldRef: null, available: true, protected: false, opaque: Boolean(group.querySelector('iframe')) });
    let controlIndex = 0;
    for (const control of group.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)) {
      const controlLabel = nativeControlLabel(control);
      if (!controlLabel) continue;
      const reference = nativeFieldReference(control);
      targets.push({
        id: `${groupId}/field/${controlIndex++}`, key: reference ? `field:${reference.toLowerCase()}` : `field:label/${groupKey.slice(6)}/${normalizeLabel(controlLabel)}`,
        label: controlLabel, kind: 'field', parentId: groupId, nativeId: reference ?? control.id,
        fieldRef: reference, available: true, protected: reference !== null && isProtectedField(reference), opaque: Boolean(control.querySelector('iframe')),
      });
    }
  }
  return { targets: distinguishGroups(targets), source: 'dom' };
}

export function matchTicketLayout(native: TicketLayout, candidates: TicketLayout[]): TicketLayout | null {
  const ranked = candidates.map(layout => {
    let score = 0;
    let strong = 0;
    for (const target of native.targets) {
      const sameKind = layout.targets.filter(candidate => candidate.kind === target.kind);
      const compact = (id: string) => id.toLowerCase().replace(/[._\-\s]/g, '');
      const exact = target.nativeId && sameKind.some(candidate => candidate.nativeId &&
        (candidate.nativeId === target.nativeId || compact(target.nativeId).endsWith(compact(candidate.nativeId))));
      if (exact) { score += 10; strong++; }
      else if (target.fieldRef && sameKind.some(candidate => candidate.fieldRef === target.fieldRef)) { score += 8; strong++; }
      else if (sameKind.some(candidate => normalizeLabel(candidate.label) === normalizeLabel(target.label))) score += 1;
      else if (target.kind === 'page') score -= 2;
    }
    return { layout, score, strong };
  }).sort((left, right) => right.score - left.score);
  const first = ranked[0];
  if (!first || first.score <= 0 || (!first.strong && candidates.length !== 1)) return null;
  if (ranked[1] && ranked[1].score === first.score) return null;
  return first.layout;
}

export function reconcileTicketLayouts(native: TicketLayout, metadata: TicketLayout | null): TicketLayout {
  if (!metadata) return native;
  const targets: TicketTarget[] = [];
  for (const page of native.targets.filter(target => target.kind === 'page')) {
    const metadataPages = metadata.targets.filter(target => target.kind === 'page' &&
      (target.nativeId === page.nativeId && Boolean(page.nativeId) || normalizeLabel(target.label) === normalizeLabel(page.label)));
    const metadataPage = metadataPages.length === 1 ? metadataPages[0] : undefined;
    const canonical = { ...page, ...(metadataPage ? { key: metadataPage.key, opaque: metadataPage.opaque } : {}) };
    targets.push(canonical);
    const nativeGroups = native.targets.filter(target => target.kind === 'group' && target.parentId === page.id);
    const metadataGroups = metadataPage ? metadata.targets.filter(target => target.kind === 'group' && target.parentId === metadataPage.id) : [];
    const metadataGroupIds = new Map<string, string>();
    for (const group of metadataGroups) {
      const occurrence = metadataGroups.slice(0, metadataGroups.indexOf(group)).filter(target => target.key === group.key).length;
      const id = `${page.id}/metadata-group/${group.key}/${occurrence}`;
      metadataGroupIds.set(group.id, id);
      targets.push({ ...group, id, parentId: page.id });
      for (const child of metadata.targets.filter(target => target.parentId === group.id)) {
        targets.push({ ...child, id: `${id}/control/${child.id}`, parentId: id });
      }
    }
    for (const group of nativeGroups) {
      const exact = metadataGroups.filter(candidate => candidate.nativeId === group.nativeId && Boolean(group.nativeId));
      const matching = exact.length ? exact : metadataGroups.filter(candidate => candidate.key === group.key);
      const byLabel = matching.length ? matching : metadataGroups.filter(candidate =>
        normalizeLabel(candidate.label) === normalizeLabel(group.label));
      const matched = byLabel.length === 1 ? byLabel[0] : undefined;
      const parentId = matched ? metadataGroupIds.get(matched.id) ?? group.id : group.id;
      if (!matched) targets.push({ ...group, parentId: page.id });
      for (const child of native.targets.filter(target => target.parentId === group.id)) {
        const alreadyMapped = matched && metadata.targets.some(target => target.parentId === matched.id &&
          (target.fieldRef && target.fieldRef === child.fieldRef || normalizeLabel(target.label) === normalizeLabel(child.label)));
        if (!alreadyMapped) targets.push({ ...child, parentId });
      }
    }
  }
  return { targets: distinguishGroups(uniqueTargets(targets)), source: metadata.source };
}

export function decodeTicketSnapshot(value: unknown): TicketSnapshot {
  if (!isObject(value) || value.version !== 2 || (value.token !== null && typeof value.token !== 'string') ||
    typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    (value.status !== 'none' && value.status !== 'loading' && value.status !== 'ready' && value.status !== 'partial' && value.status !== 'error') ||
    (value.surface !== null && value.surface !== 'page' && value.surface !== 'dialog') ||
    (value.message !== null && typeof value.message !== 'string')) throw new Error('Invalid ticket catalog response.');
  const targets = array(value.targets, 'ticket targets').map((item): TargetState => {
    if (!isObject(item) || !isTargetKey(item.key) ||
      (item.kind !== 'page' && item.kind !== 'group' && item.kind !== 'field' && item.kind !== 'region') ||
      (item.parentId !== null && typeof item.parentId !== 'string') ||
      (item.fieldRef !== null && typeof item.fieldRef !== 'string') || typeof item.nativeId !== 'string' ||
      typeof item.available !== 'boolean' || typeof item.protected !== 'boolean' || typeof item.opaque !== 'boolean' ||
      typeof item.mounted !== 'boolean' || typeof item.desiredVisible !== 'boolean' || typeof item.effectiveVisible !== 'boolean' ||
      (item.override !== null && item.override !== 'protected' && item.override !== 'active-page' && item.override !== 'validation' &&
        item.override !== 'parent-hidden' && item.override !== 'native-hidden' && item.override !== 'unmapped' && item.override !== 'disabled' && item.override !== 'empty')) {
      throw new Error('Invalid ticket target response.');
    }
    return {
      id: text(item.id, 'target ID'), key: item.key, label: text(item.label, 'target label'), kind: item.kind,
      parentId: item.parentId, nativeId: item.nativeId,
      fieldRef: item.fieldRef, available: item.available, protected: item.protected, opaque: item.opaque,
      mounted: item.mounted, desiredVisible: item.desiredVisible, effectiveVisible: item.effectiveVisible, override: item.override,
    };
  });
  const ids = new Set(targets.map(target => target.id));
  if (ids.size !== targets.length || targets.some(target => target.parentId !== null && !ids.has(target.parentId))) {
    throw new Error('Invalid ticket target hierarchy.');
  }
  for (const target of targets) {
    const visited = new Set<string>();
    let next: TargetState | undefined = target;
    while (next) {
      if (visited.has(next.id)) throw new Error('Cyclic ticket target hierarchy.');
      visited.add(next.id);
      next = next.parentId ? targets.find(parent => parent.id === next?.parentId) : undefined;
    }
  }
  return { version: 2, token: value.token, revision: value.revision, status: value.status,
    surface: value.surface, message: value.message, targets,
    ...(value.drag !== undefined ? { drag: decodeDragDiagnostics(value.drag) } : {}) };
}
import { decodeDragDiagnostics, type DragDiagnostics } from './ticket-diagnostics';
