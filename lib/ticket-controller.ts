import { ticketChangeMessage, ticketLayouts, type PreferenceAction, type Preferences } from './preferences';
import type { PreferenceCommit } from './extension';
import type { SaveFeedbackUi, SaveState } from './save-feedback';
import type { TicketVisibilityUi, VisibilityCard } from './ticket-visibility';
import { CARD_GAP, WORKSPACE_GAP, WORKSPACE_HEADING_HEIGHT, emptyCardLayout, resolveCardLayout, visualCardColumns, visualWorkspaceColumns, type CardSizing } from './card-layout';
import type { CardDragSession, CardMove, DragCard, TicketDragUi } from './ticket-drag';
import { dragStructure, type DragDiagnostics } from './ticket-diagnostics';
import { createLayoutRecorder, type LayoutReference, type LayoutTrace } from './layout-diagnostics';
import { createMetadataProvider } from './ticket-metadata';
import {
  activeTicketForm, CONTROL_SELECTOR, domTicketLayout, emptyTicketSnapshot, GROUP_SELECTOR,
  isProtectedField, nativeControlLabel, nativeGroupHeader, nativeGroupLabel, nativeTicketTabs, nativeTabLabel, normalizeLabel,
  reconcileTicketLayouts, rendered, RICH_EDITOR_SELECTOR, workItemType,
  type OverrideReason, type TargetState, type TicketLayout, type TicketSnapshot, type TicketTarget,
} from './ticket';
import css from './ticket-layout.css?inline';
import { captureTicketScroll, restoreTicketScroll } from './ticket-scroll';
import { workspaceField, workspaceMain, workspaceShell, type WorkspaceShell } from './ticket-workspace';

const PREFIX = 'data-ado-ticket-';
const HIDDEN = `${PREFIX}hidden`;
const normalizeId = (value: string) => value.toLowerCase().replace(/[._\-\s]/g, '');
function matchesId(element: Element, id: string): boolean {
  if (!id) return false;
  return ['id', 'data-field-name', 'data-control-id', 'data-group-id', 'data-page-id'].some(attribute => {
    const actual = element.getAttribute(attribute);
    return actual !== null && (actual === id || normalizeId(actual).endsWith(normalizeId(id)));
  });
}
function one<T>(values: T[]): T | null { return values.length === 1 ? values[0] ?? null : null; }

interface ControllerOptions {
  createDragUi?: (commit: (session: CardDragSession, move: CardMove) => Promise<void>, trace: LayoutTrace, reportError: (message: string) => void) => TicketDragUi;
  createFeedbackUi?: (undo: (id: string) => Promise<void>) => SaveFeedbackUi;
  createVisibilityUi?: (commit: (token: string, action: PreferenceAction) => Promise<void>, reportError: (message: string) => void) => TicketVisibilityUi;
  savePreferences?: (action: PreferenceAction) => Promise<PreferenceCommit>;
}
export function createTicketController(document: Document, address: () => string, provider = createMetadataProvider(), options: ControllerOptions = {}) {
  let preferences: Preferences | null = null;
  let root: HTMLElement | null = null;
  let surface: 'page' | 'dialog' | null = null;
  let layout: TicketLayout | null = null;
  let type: string | null = null;
  let attempted = false;
  let observedStructure = '';
  let token: string | null = null;
  let revision = 0;
  let epoch = 0;
  let pending = false;
  let error: string | null = null;
  let disposed = false;
  let scheduled = 0;
  let abort: AbortController | null = null;
  let activeDragScope = '';
  let activeVisibilityScope = '';
  let visibilityKeys = new Set<string>();
  let snapshot = emptyTicketSnapshot();
  const listeners = new Set<(snapshot: TicketSnapshot) => void>();
  const owned = new Map<Element, Set<string>>();
  const actionAnchors = new Map<HTMLElement, HTMLElement>();
  const schemaHeaders = new Map<HTMLElement, HTMLElement>();
  const observedCards = new Set<HTMLElement>();
  let diagnosticBindings = new Map<Element, LayoutReference>();
  let diagnosticPage: string | null = null;
  let scrollShell: WorkspaceShell | null = null;
  let workspaceApplied = false;
  let workspaceHeading: HTMLElement | null = null;
  const diagnostics = createLayoutRecorder(() => {
    const arrangement = diagnosticPage && preferences ? ticketLayouts(preferences.ticket)[diagnosticPage] : undefined;
    return { root, bindings: diagnosticBindings, page: diagnosticPage, enabled: preferences?.enabled ?? false,
      hiddenTargets: preferences?.ticket.hiddenTargets ?? [], viewMode: preferences?.ticket.viewMode ?? 'native',
      arrangements: diagnosticPage && arrangement ? { [diagnosticPage]: arrangement } : {} };
  });
  const style = document.createElement('style');
  style.setAttribute(`${PREFIX}style`, '');
  style.textContent = css;
  const feedback = options.createFeedbackUi?.(async id => { await saveAction({ kind: 'undo-ticket', id }); });
  function showFeedback(state: SaveState) { if (preferences?.enabled && root) feedback?.show(state, preferences.theme); }
  async function saveAction(action: PreferenceAction) {
    if (!options.savePreferences) throw new Error('The Ticket settings writer is unavailable.');
    showFeedback({ status: 'saving', message: action.kind === 'undo-ticket' ? 'Undoing...' : 'Saving...', undoId: null });
    try {
      const result = await options.savePreferences(action);
      if (!disposed) {
        if (!preferences || result.preferences.revision >= preferences.revision) {
          if (preferences?.ticket.viewMode !== result.preferences.ticket.viewMode) dragUi?.cancel();
          preferences = result.preferences;
          reconcile();
        }
        if (preferences?.revision === result.preferences.revision || result.undoId === (preferences?.ticket.undo?.id ?? null)) {
          showFeedback({ status: 'saved', message: result.message, undoId: result.undoId });
        }
      }
      return result;
    } catch (reason) {
      if (!disposed) showFeedback({ status: 'error', message: reason instanceof Error ? reason.message : 'Could not save Ticket settings.', undoId: null });
      throw reason;
    }
  }
  const dragUi = options.createDragUi?.(async (session, move) => {
    if (disposed || !preferences?.enabled || session.token !== activeDragScope) throw new Error('The ticket page changed. The card move was cancelled.');
    if (preferences.ticket.layoutLocked) throw new Error('Layout is locked. Unlock it before moving cards.');
    await saveAction({ kind: 'ticket-card-move', viewMode: session.viewMode, page: session.page,
      key: move.key, column: move.column, before: move.before, native: session.native });
    if (!disposed) {
      diagnostics.trace('save-ack', { key: move.key, column: move.column, before: move.before });
      diagnostics.snapshot('applied');
    }
  }, diagnostics.trace, message => showFeedback({ status: 'error', message, undoId: null }));
  const visibilityUi = options.createVisibilityUi?.(async (scope, action) => {
    if (disposed || !preferences?.enabled || scope !== activeVisibilityScope) throw new Error('The ticket page changed. The visibility change was cancelled.');
    const keys = action.kind === 'ticket-target' ? [action.key] : action.kind === 'ticket-restore-cards' ? action.keys : [];
    if (!keys.length || keys.some(key => !visibilityKeys.has(key))) throw new Error('The card changed. Use the current Ticket controls.');
    dragUi?.cancel();
    await saveAction(action);
  }, message => showFeedback({ status: 'error', message, undoId: null }));

  function writeStyle(value: string) {
    if (style.textContent === value) return;
    diagnostics.counter('style-writes');
    style.textContent = value;
  }

  function mark(element: Element, suffix: string, value = '') {
    const name = `${PREFIX}${suffix}`;
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    const attrs = owned.get(element) ?? new Set<string>();
    attrs.add(name);
    owned.set(element, attrs);
  }
  function normalizeHeader(card: { header: HTMLElement; anchor: HTMLElement }) {
    mark(card.header, 'header-row');
    if (card.anchor === card.header) return;
    mark(card.anchor, 'header-actions');
    const title = [...card.header.children].find((child): child is HTMLElement =>
      child instanceof HTMLElement && child !== card.anchor && !child.hasAttribute(`${PREFIX}ui`));
    if (title) mark(title, 'header-title');
  }
  function actionAnchor(header: HTMLElement) {
    const native = header.querySelector<HTMLElement>(':scope > .work-item-form-section-controls');
    if (native && !nativeHiddenLayout(native)) return native;
    if (!rendered(header)) return header;
    const existing = actionAnchors.get(header);
    if (existing?.parentElement === header) return existing;
    const anchor = document.createElement('span');
    anchor.setAttribute(`${PREFIX}ui`, 'card-actions');
    Object.assign(anchor.style, { display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', marginInlineStart: 'auto' });
    header.append(anchor); actionAnchors.set(header, anchor);
    return anchor;
  }
  function clearActionAnchors(keep = new Set<HTMLElement>()) {
    for (const [header, anchor] of actionAnchors) if (!keep.has(anchor)) { anchor.remove(); actionAnchors.delete(header); }
  }
  function clearSchemaHeaders(keep = new Set<HTMLElement>()) {
    for (const [group, header] of schemaHeaders) if (!keep.has(group)) { header.remove(); schemaHeaders.delete(group); }
  }
  function cardHeader(group: HTMLElement, target: TicketTarget): HTMLElement | null {
    const native = nativeGroupHeader(group);
    if (native) {
      schemaHeaders.get(group)?.remove(); schemaHeaders.delete(group);
      return native;
    }
    if (!preferences?.enabled || !layout || target.opaque || !matchesId(group, target.nativeId)) return null;
    const existing = schemaHeaders.get(group);
    if (existing?.parentElement === group) return existing;
    const header = document.createElement('div');
    header.setAttribute(`${PREFIX}ui`, 'schema-heading');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', minHeight: '28px' });
    const label = document.createElement('span');
    label.setAttribute('role', 'heading'); label.textContent = target.label;
    header.append(label); group.prepend(header); schemaHeaders.set(group, header);
    return header;
  }
  function clearWorkspaceHeading() { workspaceHeading?.remove(); workspaceHeading = null; }
  function rollback(preserveRoot = false) {
    const keepRoot = preserveRoot && root?.hasAttribute(`${PREFIX}root`);
    for (const [element, attributes] of owned) for (const attribute of attributes) {
      if (!keepRoot || element !== root || attribute !== `${PREFIX}root`) element.removeAttribute(attribute);
    }
    owned.clear();
    if (keepRoot && root) owned.set(root, new Set([`${PREFIX}root`]));
  }
  function nativeHiddenLayout(element: Element): boolean {
    return element.matches('[hidden], [aria-hidden="true"]') || window.getComputedStyle(element).display === 'none';
  }
  function coveredLayout(container: HTMLElement, items: ReadonlySet<HTMLElement>, ignoreHeaders = false): boolean {
    const visit = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) return !/\S/.test(node.textContent ?? '');
      if (!(node instanceof Element)) return true;
      if (node.hasAttribute(`${PREFIX}ui`)) return true;
      // Mapped controls are leaves so layout checks do not inspect their contents.
      if (node instanceof HTMLElement && items.has(node)) return true;
      if (ignoreHeaders && node === nativeGroupHeader(container)) return true;
      if (nativeHiddenLayout(node)) return true;
      if (!node.hasChildNodes()) return false;
      return [...node.childNodes].every(visit);
    };
    return visit(container);
  }
  function compactLayout(container: HTMLElement, items: ReadonlySet<HTMLElement>, ignoreHeaders = false, force = false): boolean {
    if (!force && !container.querySelector(`[${HIDDEN}]`)) return true;
    const targets = [...items].filter(item => item !== container && container.contains(item));
    const local = new Set(targets);
    if (!coveredLayout(container, local, ignoreHeaders)) return false;
    if (!targets.length) return true;
    const visit = (wrapper: HTMLElement) => {
      if (!wrapper.hasAttribute(HIDDEN) && nativeHiddenLayout(wrapper)) return;
      const children = [...wrapper.children].filter((child): child is HTMLElement =>
        child instanceof HTMLElement && targets.some(item => child === item || child.contains(item)));
      for (const child of children) if (!local.has(child)) visit(child);
      const contained = targets.filter(item => wrapper.contains(item));
      if (contained.every(item => item.hasAttribute(HIDDEN)) && !wrapper.matches(GROUP_SELECTOR)) {
        mark(wrapper, 'hidden');
        return;
      }
      mark(wrapper, 'stack');
      for (const child of children) mark(child, 'flow-item');
    };
    visit(container);
    return true;
  }
  function publish(next: TicketSnapshot) {
    if (JSON.stringify({ ...next, revision: 0 }) === JSON.stringify({ ...snapshot, revision: 0 })) return;
    snapshot = { ...next, revision: ++revision };
    for (const listener of listeners) listener(snapshot);
  }
  function pageBinding(target: TicketTarget, form: HTMLElement) {
    const tabs = nativeTicketTabs(form);
    return one(tabs.filter(tab => matchesId(tab, target.nativeId))) ??
      one(tabs.filter(tab => normalizeLabel(nativeTabLabel(tab)) === normalizeLabel(target.label)));
  }
  function reconcile() {
    if (disposed || !preferences) return;
    const previousRoot = root;
    const positions = previousRoot ? captureTicketScroll(previousRoot) : [];
    const previousShell = scrollShell;
    const wasWorkspace = workspaceApplied;
    const previousScroll = previousShell ? wasWorkspace ? previousShell.host.scrollTop :
      previousShell.host.scrollTop + previousShell.body.scrollTop : 0;
    try { reconcileLayout(); }
    finally {
      // Native measurements temporarily shorten manual layouts and clamp browser scroll positions.
      if (root === previousRoot && root?.isConnected) restoreTicketScroll(positions);
      if (root === previousRoot && scrollShell?.host === previousShell?.host && wasWorkspace !== workspaceApplied) {
        const owner = workspaceApplied ? scrollShell?.host : scrollShell?.body;
        owner?.scrollTo({ top: previousScroll, behavior: 'instant' });
      }
    }
  }
  function reconcileLayout() {
    scheduled = 0;
    if (disposed || !preferences) return;
    diagnostics.counter('reconciliations');
    workspaceApplied = false;
    if (!preferences.enabled || preferences.ticket.viewMode !== 'workspace') clearWorkspaceHeading();
    rollback(preferences.enabled);
    let active;
    try { active = activeTicketForm(document); } catch (reason) {
      clearWorkspaceHeading();
      dragUi?.update(null);
      visibilityUi?.update(null);
      feedback?.clear();
      activeVisibilityScope = '';
      clearActionAnchors();
      clearSchemaHeaders();
      rollback();
      style.remove();
      publish({ ...emptyTicketSnapshot(), revision, status: 'error', message: reason instanceof Error ? reason.message : 'Could not select the active form.' });
      return;
    }
    if (active?.root !== root) {
      clearWorkspaceHeading(); scrollShell = null;
      diagnostics.trace('form-change');
      diagnosticBindings = new Map();
      diagnosticPage = null;
      feedback?.clear();
      visibilityUi?.update(null);
      dragUi?.cancel();
      activeVisibilityScope = '';
      clearActionAnchors();
      clearSchemaHeaders();
      abort?.abort();
      if (root) {
        resize.unobserve(root);
        root.removeAttribute(`${PREFIX}root`);
        owned.delete(root);
      }
      root = active?.root ?? null;
      if (root) resize.observe(root);
      surface = active?.surface ?? null;
      token = root ? crypto.randomUUID() : null;
      type = null;
      attempted = false;
      observedStructure = '';
      layout = null;
      error = null;
      pending = false;
      epoch++;
    }
    if (!root) {
      feedback?.clear();
      style.remove();
      activeDragScope = '';
      activeVisibilityScope = '';
      dragUi?.update(null);
      visibilityUi?.update(null);
      clearActionAnchors();
      clearSchemaHeaders();
      for (const card of observedCards) resize.unobserve(card);
      observedCards.clear();
      publish({ ...emptyTicketSnapshot(), revision });
      return;
    }
    if (!preferences.enabled) clearSchemaHeaders();
    const detected = workItemType(root);
    if (detected !== type) {
      abort?.abort();
      type = detected;
      layout = null;
      error = null;
      pending = false;
      attempted = false;
      epoch++;
    }
    const native = domTicketLayout(root);
    const structure = native.targets.map(target => `${target.kind}:${target.nativeId}:${target.key}`).join('|');
    if (!type && !layout && !pending && !error && structure !== observedStructure) attempted = false;
    observedStructure = structure;
    if (!attempted && !pending && !error) {
      attempted = true;
      pending = true;
      const request = ++epoch;
      abort = new AbortController();
      const metadata = type ? provider.get(address(), type, abort.signal) : provider.discover(address(), native, abort.signal);
      void metadata.then(value => {
        if (disposed || request !== epoch) return;
        layout = value;
        pending = false;
        schedule();
      }).catch(reason => {
        if (disposed || request !== epoch) return;
        console.error('[ADOverride] Form metadata unavailable.', reason);
        pending = false;
        error = reason instanceof Error ? reason.message : 'Form metadata unavailable.';
        schedule();
      });
    }
    let catalog: TicketLayout;
    try { catalog = reconcileTicketLayouts(native, layout); } catch (reason) {
      // A conflicting schema must surface as an error and fall back to the native catalog, not stall in loading.
      console.error('[ADOverride] Form metadata conflicts with the native form.', reason);
      error = reason instanceof Error ? reason.message : 'Form metadata conflicts with the native form.';
      layout = null;
      catalog = native;
    }
    const allTargets = [...catalog.targets];
    const subheader = root.querySelector<HTMLElement>('.work-item-form-subheader');
    const details = allTargets.find(target => target.kind === 'page' && target.key === 'page:details');
    if (subheader && details) {
      const headerFields = [
        ['System.AreaPath', 'Area'], ['System.IterationPath', 'Iteration'], ['System.Reason', 'Reason'],
        ['System.AssignedTo', 'Assigned To'], ['System.Tags', 'Tags'], ['System.State', 'State'],
      ];
      const found = headerFields.filter(([reference, label]) => reference && label &&
        [...subheader.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].some(control =>
          matchesId(control, reference) || normalizeLabel(nativeControlLabel(control) ?? '') === normalizeLabel(label)));
      if (found.length) {
        allTargets.push({ id: 'system-header', key: 'group:details/header', label: 'Header fields', kind: 'group',
          parentId: details.id, nativeId: '', fieldRef: null, available: true, protected: true, opaque: false });
        for (const [reference, label] of found) if (reference && label) {
          allTargets.push({ id: `system-header/${reference}`, key: `field:${reference.toLowerCase()}`, label, kind: 'field',
            parentId: 'system-header', nativeId: reference, fieldRef: reference, available: true,
            protected: isProtectedField(reference), opaque: false });
        }
      }
    }
    const pages = allTargets.filter(target => target.kind === 'page');
    const bindings = new Map<string, HTMLElement>();
    for (const page of pages) {
      const element = pageBinding(page, root);
      if (element) bindings.set(page.id, element);
    }
    const selected = pages.find(page => {
      const tab = bindings.get(page.id);
      return tab?.getAttribute('aria-selected') === 'true' || tab?.classList.contains('selected');
    }) ?? pages.find(page => page.key === 'page:details');
    diagnosticPage = selected?.key ?? null;
    const groups = [...root.querySelectorAll<HTMLElement>(GROUP_SELECTOR)].filter(group => !group.parentElement?.closest(GROUP_SELECTOR));
    if (subheader) bindings.set('system-header', subheader);
    const containsChild = (group: HTMLElement, child: TicketTarget) => [...group.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].some(control =>
      matchesId(control, child.nativeId) || [...control.querySelectorAll('[id], [data-field-name], [data-control-id]')].some(node => matchesId(node, child.nativeId)) ||
      normalizeLabel(nativeControlLabel(control) ?? '') === normalizeLabel(child.label));
    const usedGroups = new Set<HTMLElement>();
    for (const target of allTargets.filter(target => target.kind === 'group' && target.parentId === selected?.id)) {
      const byLabel = groups.filter(group => !usedGroups.has(group) && normalizeLabel(nativeGroupLabel(group) ?? '') === normalizeLabel(target.label));
      let element = one(groups.filter(group => matchesId(group, target.nativeId))) ?? one(byLabel);
      if (!element && byLabel.length > 1) {
        // Real ADO cards carry no process group ID, so repeated captions are told apart by their fields.
        const children = allTargets.filter(child => child.parentId === target.id && (child.kind === 'field' || child.kind === 'region'));
        const scores = byLabel.map(group => children.filter(child => containsChild(group, child)).length);
        const best = Math.max(0, ...scores);
        if (best > 0 && scores.filter(score => score === best).length === 1) element = byLabel[scores.indexOf(best)] ?? null;
      }
      if (element) { bindings.set(target.id, element); usedGroups.add(element); }
    }
    const displayLabels = new Map<string, string>();
    const pageGroups = allTargets.filter(target => target.kind === 'group' && target.parentId === selected?.id);
    for (const target of pageGroups) {
      const element = bindings.get(target.id);
      const peers = pageGroups.filter(peer => normalizeLabel(peer.label) === normalizeLabel(target.label));
      if (!element || peers.length < 2) continue;
      const side = (group: HTMLElement | undefined) => group?.closest('.work-item-form-right') ? 'side' : 'main';
      const sameSide = peers.filter(peer => side(bindings.get(peer.id)) === side(element));
      displayLabels.set(target.id, `${target.label} (${side(element)}${sameSide.length > 1 ? ` ${sameSide.indexOf(target) + 1}` : ''})`);
    }
    for (const target of allTargets.filter(target => target.kind === 'field' || target.kind === 'region')) {
      const parent = target.parentId ? bindings.get(target.parentId) : null;
      if (!parent) continue;
      const controls = [...parent.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)];
      const exact = one(controls.filter(control =>
        matchesId(control, target.nativeId) || [...control.querySelectorAll('[id], [data-field-name], [data-control-id]')].some(child => matchesId(child, target.nativeId))));
      const element = exact ?? one(controls.filter(control => {
        return normalizeLabel(nativeControlLabel(control) ?? '') === normalizeLabel(target.label);
      }));
      if (element) bindings.set(target.id, element);
      else if (target.kind === 'region' && controls.length === 0 && allTargets.filter(entry => entry.parentId === target.parentId).length === 1) bindings.set(target.id, parent);
    }
    const hidden = new Set(preferences.ticket.hiddenTargets);
    diagnosticBindings = new Map();
    for (const target of allTargets) {
      const element = bindings.get(target.id);
      if (element) diagnosticBindings.set(element, { key: target.key, label: target.label, kind: target.kind });
    }
    diagnostics.snapshot('native');
    const workspaceWanted = preferences.ticket.viewMode === 'workspace';
    const savedLayout = selected ? ticketLayouts(preferences.ticket)[selected.key] : undefined;
    const nativeCardSizes = new Map<HTMLElement, CardSizing & { minimumHeight: number; paddingBottom: number }>();
    const nativeGridWidths = new Map<HTMLElement, number>();
    if (preferences.enabled && (savedLayout || workspaceWanted)) for (const grid of root.querySelectorAll<HTMLElement>('.work-item-grid')) {
      nativeGridWidths.set(grid, grid.getBoundingClientRect().width);
    }
    if (preferences.enabled && (savedLayout || workspaceWanted)) for (const group of groups) {
      const bounds = group.getBoundingClientRect();
      const richEditor = [...group.querySelectorAll(RICH_EDITOR_SELECTOR)].some(rendered);
      const paddingBottom = Number.parseFloat(getComputedStyle(group).paddingBottom);
      if (!Number.isFinite(paddingBottom)) throw new Error('Native card spacing measurements are unavailable.');
      nativeCardSizes.set(group, { width: bounds.width, minimumWidth: richEditor || bounds.width >= 480 ? 480 : 240,
        minimumHeight: richEditor ? bounds.height : 0, paddingBottom });
    }
    let unmappedLayout = false;
    const ambiguous = new Set(allTargets.filter(target => target.kind !== 'field' &&
      allTargets.filter(candidate => candidate.key === target.key).length > 1).map(target => target.key));
    const states: TargetState[] = [];
    const stateMap = new Map<string, TargetState>();
    for (const target of allTargets) {
      const element = bindings.get(target.id);
      const parent = target.parentId ? stateMap.get(target.parentId) : null;
      const desiredVisible = !hidden.has(target.key);
      const protectedTarget = target.protected || ambiguous.has(target.key) || Boolean(element?.closest('.work-item-form-header') && target.kind !== 'page');
      const validation = Boolean(element?.matches('[aria-invalid="true"]') || element?.querySelector('[aria-invalid="true"], [role="alert"]'));
      const nativeVisible = Boolean(element && rendered(element));
      let override: OverrideReason = null;
      let effectiveVisible = desiredVisible;
      if (!preferences.enabled) { effectiveVisible = nativeVisible; override = 'disabled'; }
      else if (protectedTarget) { effectiveVisible = nativeVisible; override = 'protected'; }
      else if (validation) { effectiveVisible = true; override = 'validation'; }
      else if (target.kind === 'page' && target.id === selected?.id && !desiredVisible) { effectiveVisible = true; override = 'active-page'; }
      else if (parent && !parent.effectiveVisible && (!parent.desiredVisible || parent.override === 'parent-hidden')) { effectiveVisible = false; override = 'parent-hidden'; }
      else if (!element) { effectiveVisible = false; override = 'unmapped'; }
      else if (!nativeVisible && desiredVisible) { effectiveVisible = false; override = 'native-hidden'; }
      if (element && preferences.enabled && !protectedTarget && !validation && !effectiveVisible && nativeVisible &&
        (!desiredVisible || override === 'parent-hidden')) mark(element, 'hidden');
      const state = { ...target, label: displayLabels.get(target.id) ?? target.label, protected: protectedTarget, mounted: Boolean(element), desiredVisible, effectiveVisible, override };
      states.push(state);
      stateMap.set(target.id, state);
    }
    // Empty groups collapse only when every native control is mapped and hidden by us.
    if (preferences.enabled) for (const group of groups) {
      const controls = [...group.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)];
      if (controls.length && !group.querySelector('iframe') && controls.every(control => control.hasAttribute(HIDDEN)) &&
        coveredLayout(group, new Set(controls), true)) {
        mark(group, 'hidden');
        const target = states.find(target => bindings.get(target.id) === group && target.kind === 'group');
        if (target) { target.effectiveVisible = false; target.override = 'empty'; }
      }
    }
    if (preferences.enabled && [...owned.keys()].some(element => element.hasAttribute(HIDDEN))) {
      if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      mark(root, 'root');
      const mapped = new Set(bindings.values());
      const mappedGroups = new Set(groups.filter(group => mapped.has(group)));
      for (const group of mappedGroups) {
        if (group.hasAttribute(HIDDEN)) continue;
        const controls = new Set([...group.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter(control => mapped.has(control)));
        if (!compactLayout(group, controls, true)) unmappedLayout = true;
      }
      for (const grid of root.querySelectorAll<HTMLElement>('.work-item-grid')) {
        if (!grid.querySelector(`[${HIDDEN}]`)) continue;
        const main = [...grid.children].filter((child): child is HTMLElement =>
          child instanceof HTMLElement && child.matches('.work-item-form-first-section, .work-item-form-discussion'));
        const rail = one([...grid.children].filter((child): child is HTMLElement =>
          child instanceof HTMLElement && child.matches('.work-item-form-right')));
        let supported = true;
        for (const section of main) {
          if (!mappedGroups.has(section) && !compactLayout(section, mappedGroups, false, true)) supported = false;
        }
        if (rail && rendered(rail)) {
          const columns = [...rail.children].filter((child): child is HTMLElement =>
            child instanceof HTMLElement && child.matches('.work-item-form-section'));
          for (const column of columns) if (!compactLayout(column, mappedGroups, false, true)) supported = false;
          if (!columns.length || !coveredLayout(rail, new Set(columns))) supported = false;
          if (supported) {
            if (columns.every(column => column.hasAttribute(HIDDEN))) mark(rail, 'hidden');
            else {
              mark(rail, 'columns');
              if (columns.filter(column => rendered(column)).length === 1) mark(rail, 'rail-columns', '1');
              for (const column of columns) mark(column, 'column-item');
            }
          }
        }
        const items = new Set([...main, ...(rail ? [rail] : [])]);
        if (!items.size || !coveredLayout(grid, items)) supported = false;
        if (!supported) { unmappedLayout = true; continue; }
        mark(grid, 'grid');
        mark(grid, 'main', main.some(section => rendered(section)) ? 'true' : 'false');
        mark(grid, 'rail', rail && rendered(rail) ? 'true' : 'false');
        if (root.clientWidth < 850) mark(grid, 'narrow');
        for (const section of main) { mark(section, 'main-item'); mark(section, 'flow-item'); }
        if (rail) { mark(rail, 'rail-item'); mark(rail, 'flow-item'); }
      }
    } else if (!preferences.enabled) { style.remove(); feedback?.clear(); }
    const cards: DragCard[] = [];
    for (const target of states.filter(target => target.kind === 'group' && target.parentId === selected?.id && !target.protected)) {
      const element = bindings.get(target.id);
      const header = element ? cardHeader(element, target) : null;
      if (!element || !header || !element.closest('.work-item-grid')) continue;
      const section = element.closest<HTMLElement>('.work-item-form-right > .work-item-form-section');
      const sections = section?.parentElement ? [...section.parentElement.children].filter(child => child.matches('.work-item-form-section')) : [];
      const column = section ? sections.indexOf(section) === 0 ? 1 : 2 : 0;
      cards.push({ key: target.key, label: target.label, element, header,
        anchor: preferences.enabled && !preferences.ticket.layoutLocked ? actionAnchor(header) : header, column });
    }
    const safeGrids = [...root.querySelectorAll<HTMLElement>('.work-item-grid')].filter(grid =>
      cards.some(card => grid.contains(card.element)) && coveredLayout(grid, new Set(cards.filter(card => grid.contains(card.element)).map(card => card.element))));
    const dragGrid = one(safeGrids);
    const currentGroups = states.filter(target => target.kind === 'group' && target.parentId === selected?.id && !target.protected);
    const mappedGroups = currentGroups.flatMap(target => {
      const element = bindings.get(target.id);
      return element ? [element] : [];
    });
    const missingHeaders = mappedGroups.filter(group => !nativeGroupHeader(group) && !schemaHeaders.has(group)).length;
    const hiddenHeaders = mappedGroups.filter(group => {
      const header = nativeGroupHeader(group) ?? schemaHeaders.get(group);
      return header && rendered(group) && !rendered(header);
    }).length;
    const dragBlocked = preferences.enabled && !preferences.ticket.layoutLocked && !pending && mappedGroups.length > 0 && !dragGrid;
    const dragReason = !dragBlocked ? null : !cards.length ?
      'Card dragging is unavailable: no supported native card headers or grid were found.' :
      safeGrids.length > 1 ? 'Card dragging is unavailable: multiple native card grids were found.' :
        'Card dragging is unavailable: the native grid contains unmapped regions or unsupported card headers.';
    const dragDiagnostics: DragDiagnostics = {
      status: !preferences.enabled ? 'disabled' : pending ? 'loading' : preferences.ticket.layoutLocked ? 'locked' : dragGrid ? 'available' : 'blocked',
      reason: dragReason,
      currentGroups: currentGroups.length, mappedGroups: mappedGroups.length, candidates: cards.length,
      missingHeaders, hiddenHeaders, grids: root.querySelectorAll('.work-item-grid').length,
      safeGrids: safeGrids.length,
      visibleCards: cards.filter(card => !card.element.hasAttribute(HIDDEN) && rendered(card.element)).length,
      mountedHandles: root.querySelectorAll('ado-ticket-drag-handle').length,
      structure: dragStructure(root),
    };
    let workspaceMessage: string | null = null;
    if (preferences.enabled && selected && dragGrid) {
      const inGrid = cards.filter(card => dragGrid.contains(card.element));
      const shell = workspaceShell(root, dragGrid);
      scrollShell = shell;
      if (workspaceWanted) {
        mark(root, 'workspace');
        for (const card of inGrid) card.column = workspaceMain(card, allTargets) ? 0 : 1;
        if (!shell) workspaceMessage = 'Workspace cards are arranged, but this header retains its native layout because its structure is unsupported.';
      }
      const nativeColumns = emptyCardLayout();
      for (const card of inGrid) nativeColumns[card.column].push(card.key);
      const placement = resolveCardLayout(savedLayout, nativeColumns);
      const visible = inGrid.filter(card => !card.element.hasAttribute(HIDDEN) && rendered(card.element));
      if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      mark(root, 'root');
      for (const card of preferences.ticket.layoutLocked ? [] : visible) normalizeHeader(card);
      if ((savedLayout || workspaceWanted) && (visible.length || workspaceWanted && shell)) {
        const nativeWidth = nativeGridWidths.get(dragGrid);
        if (nativeWidth === undefined || !Number.isFinite(nativeWidth) || nativeWidth <= 0) {
          throw new Error('The native card grid has no usable width.');
        }
        mark(dragGrid, 'manual');
        let shellStyles = '';
        if (workspaceWanted && shell) {
          const commandWidth = shell.commands.getBoundingClientRect().width;
          const commentWidth = shell.comments?.getBoundingClientRect().width ?? 0;
          mark(shell.host, 'workspace-shell');
          if (shell.formNavigation) mark(shell.formNavigation, 'workspace-form-navigation');
          mark(shell.header, 'workspace-header');
          mark(shell.footer, 'workspace-footer');
          mark(shell.subheader, 'workspace-subheader');
          mark(shell.navigation, 'workspace-navigation');
          mark(shell.body, 'workspace-body');
          for (const flow of shell.flow) mark(flow, 'workspace-flow');
          mark(shell.titleRow, 'workspace-title');
          mark(shell.commands, 'workspace-commands');
          for (const [index, element] of shell.metadata.entries()) mark(element, 'workspace-meta', String(index));
          workspaceApplied = true;
          if (nativeWidth >= 850) {
            shellStyles += `[data-ado-ticket-root] [data-ado-ticket-workspace-title]{padding-inline-end:${commandWidth + commentWidth + WORKSPACE_GAP * 2}px!important;}\n` +
              `[data-ado-ticket-root] [data-ado-ticket-workspace-commands]{position:absolute!important;right:8px;top:8px;width:${commandWidth}px;}\n`;
            if (shell.comments) {
              mark(shell.comments, 'workspace-comments');
              shellStyles += `[data-ado-ticket-root] [data-ado-ticket-workspace-comments]{position:absolute!important;right:${commandWidth + 8 + WORKSPACE_GAP}px;top:8px;}\n`;
            }
          }
        }
        const sizes = new Map<string, CardSizing>();
        for (const card of visible) {
          const size = nativeCardSizes.get(card.element);
          if (!size) throw new Error('Native card measurements are unavailable.');
          sizes.set(card.key, size);
        }
        const columns = workspaceWanted ? visualWorkspaceColumns(placement, new Set(visible.map(card => card.key)), nativeWidth, sizes, Boolean(shell)) :
          visualCardColumns(placement, new Set(visible.map(card => card.key)), nativeWidth, sizes);
        const propertyColumn = columns.find(column => column.column === 1) ?? columns[0];
        if (workspaceWanted && shell && propertyColumn) for (const index of shell.metadata.keys()) {
          shellStyles += `[data-ado-ticket-root] [data-ado-ticket-workspace-meta="${index}"]{width:${propertyColumn.width}px!important;}\n`;
        }
        const indices = new Map(visible.map((card, index) => [card.key, index]));
        for (const card of visible) {
          mark(card.element, 'manual-card', String(indices.get(card.key)));
          if (workspaceWanted) {
            mark(card.element, 'workspace-card');
            const shortFields: HTMLElement[] = [];
            for (const field of card.element.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)) {
              const wrapper = workspaceField(field);
              if (wrapper) {
                mark(field, 'workspace-control');
                mark(wrapper, 'workspace-field');
                shortFields.push(field);
              }
            }
            if (shortFields.length > 1) {
              let wrapper = shortFields[0]?.parentElement ?? null;
              while (wrapper && wrapper !== card.element && !shortFields.every(field => wrapper?.contains(field))) wrapper = wrapper.parentElement;
              if (wrapper && wrapper !== card.element) compactLayout(wrapper, new Set(shortFields), false, true);
            }
          }
          let wrapper = card.element.parentElement;
          while (wrapper && wrapper !== dragGrid) {
            if (!nativeHiddenLayout(wrapper)) mark(wrapper, 'contents');
            wrapper = wrapper.parentElement;
          }
        }
        const selector = (key: string) => `[data-ado-ticket-root] [data-ado-ticket-manual-card="${indices.get(key)}"]`;
        const widths = `[data-ado-ticket-root] [data-ado-ticket-manual]{width:${nativeWidth}px!important;}\n` +
          columns.flatMap(column => column.keys.map(key => {
          const card = visible.find(card => card.key === key);
          const nativeSize = card ? nativeCardSizes.get(card.element) : undefined;
          if (!card || !nativeSize) throw new Error('Native editor measurements are unavailable.');
          const paddingBottom = workspaceWanted ? Math.min(nativeSize.paddingBottom, WORKSPACE_GAP) : nativeSize.paddingBottom;
          const editorShown = [...card.element.querySelectorAll('.html-editor, .rooster-editor')].some(editor =>
            !editor.closest(`[${HIDDEN}]`));
          const minimumHeight = editorShown ? Math.max(0, nativeSize.minimumHeight - nativeSize.paddingBottom + paddingBottom) : 0;
          return `${selector(key)}{width:${column.width}px!important;left:${column.x}px!important;top:0!important;` +
            (workspaceWanted ? `padding-bottom:${paddingBottom}px!important;` : '') +
            (minimumHeight > 0 ? `min-height:${minimumHeight}px!important;` : '') + '}';
        })).join('\n');
        writeStyle(`${css}\n${shellStyles}\n${widths}`);
        const metadata = workspaceWanted && shell ? shell.metadata.filter(rendered) : [];
        const metadataHeight = metadata.length ? WORKSPACE_HEADING_HEIGHT + metadata.reduce((sum, element) => sum + element.getBoundingClientRect().height + WORKSPACE_GAP, 0) : 0;
        const stacked = workspaceWanted && columns.length === 1 && columns[0]?.column === 0;
        let propertiesY = 0;
        const cardGap = workspaceWanted ? WORKSPACE_GAP : CARD_GAP;
        const positions: string[] = [];
        let height = 0;
        for (const column of columns) {
          let y = column.column === 1 ? metadataHeight : 0;
          let inserted = !stacked;
          for (const key of column.keys) {
            if (!inserted && placement[1].includes(key)) { propertiesY = y; y += metadataHeight; inserted = true; }
            const card = visible.find(card => card.key === key);
            if (!card) throw new Error('A card disappeared while arranging the form.');
            positions.push(`${selector(key)}{top:${y}px!important;}`);
            y += card.element.getBoundingClientRect().height + cardGap;
          }
          if (!inserted) { propertiesY = y; y += metadataHeight; }
          height = Math.max(height, y - (column.keys.length ? cardGap : 0));
        }
        const cardStyles = `${widths}\n${positions.join('\n')}\n[data-ado-ticket-root] [data-ado-ticket-manual]{height:${height}px!important;}`;
        // Shell offsets depend on the final body height, not the temporary flex allocation.
        writeStyle(`${css}\n${shellStyles}\n${cardStyles}`);
        if (workspaceWanted && shell && nativeWidth >= 850) {
          const hostBox = shell.host.getBoundingClientRect();
          const top = shell.header.getBoundingClientRect().top - hostBox.top + shell.host.scrollTop - shell.host.clientTop + 8;
          shellStyles += `[data-ado-ticket-root] [data-ado-ticket-workspace-commands]{top:${top}px;}\n` +
            (shell.comments ? `[data-ado-ticket-root] [data-ado-ticket-workspace-comments]{top:${top}px;}\n` : '');
        }
        if (shell && metadataHeight && propertyColumn) {
          if (!workspaceHeading) {
            workspaceHeading = document.createElement('div');
            workspaceHeading.setAttribute(`${PREFIX}ui`, 'workspace-properties');
            workspaceHeading.setAttribute('role', 'heading');
            workspaceHeading.setAttribute('aria-level', '2');
            workspaceHeading.textContent = 'Properties';
          }
          if (workspaceHeading.parentElement !== dragGrid) dragGrid.append(workspaceHeading);
          const gridBox = dragGrid.getBoundingClientRect();
          const hostBox = shell.host.getBoundingClientRect();
          const x = gridBox.left - hostBox.left + shell.host.scrollLeft - shell.host.clientLeft + propertyColumn.x;
          let y = gridBox.top - hostBox.top + shell.host.scrollTop - shell.host.clientTop + propertiesY + WORKSPACE_HEADING_HEIGHT;
          shellStyles += `[data-ado-ticket-root] [data-ado-ticket-ui="workspace-properties"]{left:${propertyColumn.x}px;top:${propertiesY}px;width:${propertyColumn.width}px;height:${WORKSPACE_HEADING_HEIGHT}px;}\n`;
          for (const element of metadata) {
            const index = shell.metadata.indexOf(element);
            shellStyles += `[data-ado-ticket-root] [data-ado-ticket-workspace-meta="${index}"]{left:${x}px;top:${y}px;}\n`;
            y += element.getBoundingClientRect().height + WORKSPACE_GAP;
          }
        } else clearWorkspaceHeading();
        writeStyle(`${css}\n${shellStyles}\n${cardStyles}`);
      } else writeStyle(css);
      activeDragScope = preferences.ticket.layoutLocked ? '' : `${token}:${epoch}:${selected.key}:${preferences.ticket.viewMode}`;
      dragUi?.update(preferences.ticket.layoutLocked ? null : { token: activeDragScope, page: selected.key, grid: dragGrid, cards: visible,
        native: nativeColumns, layout: placement, theme: preferences.theme, disabled: pending, viewMode: preferences.ticket.viewMode,
        columns: workspaceWanted ? [0, 1] : [0, 1, 2] });
      const nextObserved = new Set(inGrid.map(card => card.element));
      for (const card of observedCards) if (!nextObserved.has(card)) { resize.unobserve(card); observedCards.delete(card); }
      for (const card of nextObserved) if (!observedCards.has(card)) { resize.observe(card); observedCards.add(card); }
    } else {
      clearWorkspaceHeading();
      if (workspaceWanted && cards.length) workspaceMessage = 'Workspace cannot safely arrange this native grid. Its original layout is retained.';
      activeDragScope = '';
      dragUi?.update(null);
      for (const card of observedCards) resize.unobserve(card);
      observedCards.clear();
      if (preferences.enabled && savedLayout) unmappedLayout = true;
    }
    const availableGroups = currentGroups.filter(target => target.available && !target.opaque);
    visibilityKeys = new Set(availableGroups.map(target => target.key));
    const visibilityCards: VisibilityCard[] = [];
    for (const target of preferences.ticket.layoutLocked ? [] : availableGroups) {
      const element = bindings.get(target.id);
      const header = element ? cardHeader(element, target) : null;
      if (!target.desiredVisible || !element || !header || !rendered(element) || !rendered(header)) continue;
      const anchor = preferences.enabled ? actionAnchor(header) : header;
      visibilityCards.push({ key: target.key, label: target.label, element, header, anchor });
    }
    const hiddenCards = availableGroups.filter(target => !target.desiredVisible).map(target => ({ key: target.key, label: target.label }));
    if (preferences.enabled && selected && visibilityUi) {
      if (visibilityCards.length) {
        if (!style.isConnected) (document.head ?? document.documentElement).append(style);
        mark(root, 'root');
        for (const card of visibilityCards) normalizeHeader(card);
      }
      activeVisibilityScope = `${token}:${epoch}:${selected.key}`;
      visibilityUi.update({ token: activeVisibilityScope, root, cards: visibilityCards, hidden: hiddenCards, theme: preferences.theme,
        disabled: pending, locked: preferences.ticket.layoutLocked });
    } else {
      activeVisibilityScope = '';
      visibilityUi?.update(null);
    }
    const neededAnchors = new Set<HTMLElement>(preferences.enabled ? [
      ...(visibilityUi ? visibilityCards.map(card => card.anchor) : []),
      ...(!preferences.ticket.layoutLocked && dragGrid && dragUi ? cards.filter(card => dragGrid.contains(card.element) && rendered(card.element)).map(card => card.anchor) : []),
    ] : []);
    clearActionAnchors(neededAnchors);
    clearSchemaHeaders(new Set(cards.map(card => card.element)));
    const unmappedCurrentGroups = allTargets.some(target => target.kind === 'group' && target.parentId === selected?.id &&
      target.available && !target.opaque && !bindings.has(target.id));
    dragDiagnostics.mountedHandles = root.querySelectorAll('ado-ticket-drag-handle').length;
    publish({
      version: 2, token, revision, surface, status: pending ? 'loading' : layout && !unmappedCurrentGroups && !unmappedLayout && !dragBlocked && !workspaceMessage ? 'ready' : 'partial',
      message: pending ? null : error ?? (ambiguous.size ? 'Ambiguous global card identities are kept visible.' :
        unmappedLayout ? 'Some layout containers include unmapped content and retain their native layout.' :
        unmappedCurrentGroups ? 'Some cards are not mounted or mapped yet. Unmapped content is unchanged.' : workspaceMessage ?? dragReason),
      targets: states, drag: dragDiagnostics,
    });
  }
  function schedule(reason = 'mutation') {
    diagnostics.counter(`schedule-${reason}`);
    if (!scheduled && !disposed) scheduled = window.requestAnimationFrame(reconcile);
  }
  const observer = new MutationObserver(changes => {
    const nativeChanges = changes.filter(change => {
      const target = change.target instanceof Element ? change.target : change.target.parentElement;
      if (target?.closest(`[${PREFIX}ui], [${PREFIX}style]`)) return false;
      if (change.type === 'attributes') return !change.attributeName?.startsWith(PREFIX);
      return [...change.addedNodes, ...change.removedNodes].some(node =>
        !(node instanceof Element && (node.hasAttribute(`${PREFIX}style`) || node.hasAttribute(`${PREFIX}ui`))));
    });
    if (nativeChanges.length) {
      const change = nativeChanges[0];
      const target = change?.target instanceof Element ? change.target : change?.target.parentElement ?? null;
      diagnostics.trace('mutation', { count: nativeChanges.length, attribute: change?.attributeName ?? null,
        target: diagnostics.nodeId(target), tag: target?.tagName.toLowerCase() ?? null,
        withinForm: target && root?.contains(target) ? 1 : 0 });
      schedule();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-selected', 'aria-invalid', 'data-work-item-type'] });
  const resize = new ResizeObserver(entries => {
    diagnostics.trace('resize', { count: entries.length, target: diagnostics.nodeId(entries[0]?.target ?? null),
      width: entries[0]?.contentRect.width ?? null, height: entries[0]?.contentRect.height ?? null });
    schedule('resize');
  });
  resize.observe(document.documentElement);
  return {
    get snapshot() { return snapshot; },
    startLayoutRecording() { diagnostics.start(); schedule('recording'); },
    exportLayoutRecording() { return diagnostics.exportReport(); },
    setPreferences(value: Preferences) {
      if (preferences && value.revision < preferences.revision) return;
      const loaded = preferences !== null;
      const previous = preferences?.ticket.undo;
      if (preferences?.ticket.viewMode !== value.ticket.viewMode) dragUi?.cancel();
      preferences = value;
      reconcile();
      if (loaded && root && value.enabled && value.ticket.undo && value.ticket.undo.id !== previous?.id) {
        showFeedback({ status: 'saved', message: ticketChangeMessage(value.ticket.undo.kind), undoId: value.ticket.undo.id });
      } else if (previous && !value.ticket.undo) feedback?.clear();
    },
    failSettings(message: string) { preferences = null; dragUi?.update(null); visibilityUi?.update(null); feedback?.clear(); clearActionAnchors(); clearSchemaHeaders(); clearWorkspaceHeading(); rollback(); style.remove(); publish({ ...snapshot, status: 'error', message }); },
    subscribe(listener: (value: TicketSnapshot) => void) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    refresh() { dragUi?.cancel(); clearSchemaHeaders(); error = null; layout = null; attempted = false; abort?.abort(); epoch++; pending = false; provider.clear(); schedule('refresh'); },
    dispose() {
      disposed = true; abort?.abort(); epoch++; observer.disconnect(); resize.disconnect();
      diagnostics.dispose(); diagnosticBindings.clear();
      dragUi?.dispose();
      visibilityUi?.dispose();
      clearActionAnchors();
      clearSchemaHeaders();
      clearWorkspaceHeading();
      feedback?.dispose();
      if (scheduled) window.cancelAnimationFrame(scheduled);
      rollback(); style.remove(); listeners.clear(); provider.clear(); root = null;
    },
  };
}
