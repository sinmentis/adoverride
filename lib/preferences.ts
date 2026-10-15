import { scopeKey, type AdoContext, type Scope } from './context';
import { decodeTicketVisibility, emptyTicketVisibility, isObject, isTargetKey, type TicketArea, type TicketVisibility } from './ticket';
import { decodeCardLayout, decodeCardLayouts, decodeWorkspaceLayouts, isCardColumn, isCardKey, isPageKey, moveCard, resolveCardLayout,
  type CardColumn, type CardLayout, type CardLayouts } from './card-layout';
import { decodeBoardProfile, defaultBoardProfile, isBoardCardField, isBoardPresentationFeature,
  type BoardCardField, type BoardPresentationFeature, type BoardProfile } from './board-profile';
export { defaultBoardProfile, type BoardProfile } from './board-profile';

export const DEFAULT_FEATURES = {
  hideServices: true,
  compactHeader: false,
  showLabels: true,
  showAssignees: true,
  showParents: true,
  hideEmpty: true,
  expandDescriptions: true,
};

export type FeatureId = keyof typeof DEFAULT_FEATURES;
export type GroupId = 'navigation' | 'cards' | 'workitems';
export type Density = 'comfortable' | 'compact';
export type Theme = 'light' | 'dark';
export type Appearance = { density: Density; features: Record<FeatureId, boolean> };
export type TicketViewMode = 'native' | 'workspace';
export interface TicketProfile extends TicketVisibility { cardLayouts: CardLayouts; viewMode: TicketViewMode; workspaceLayouts: CardLayouts }
export type TicketChangeKind = 'layout' | 'visibility' | 'preset';
export interface TicketUndo {
  id: string;
  kind: TicketChangeKind;
  previous: TicketProfile & { presetId: string };
}
export interface Preset {
  id: string;
  name: string;
  appearance?: Appearance;
  board?: BoardProfile;
  ticket?: TicketProfile;
}
export interface StoredView {
  presetId: string;
  appearance: Appearance;
  board: BoardProfile | null;
}
export interface Preferences {
  version: 11;
  revision: number;
  enabled: boolean;
  theme: Theme;
  scope: Scope;
  savedPresets: Preset[];
  views: Record<string, StoredView>;
  ticket: TicketProfile & { presetId: string; savedPresets: Preset[]; layoutLocked: boolean; undo: TicketUndo | null };
}
export const MAX_CONFIGURATION_BYTES = 2 * 1024 * 1024;
export function portablePreferences(value: unknown): Preferences {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_CONFIGURATION_BYTES) throw new Error('Configuration exceeds the 2 MB limit.');
  const preferences = decodePreferences(value);
  return { ...preferences, revision: 0, ticket: { ...preferences.ticket, undo: null } };
}

export const FEATURES: { id: FeatureId; title: string; description: string; group: GroupId }[] = [
  { id: 'hideServices', title: 'Hide unused services', description: 'Repos, Pipelines, and Test Plans', group: 'navigation' },
  { id: 'compactHeader', title: 'Compact header', description: 'Reduce secondary header controls', group: 'navigation' },
  { id: 'showLabels', title: 'Show card labels', description: 'Keep tags visible on cards', group: 'cards' },
  { id: 'showAssignees', title: 'Show assignees', description: 'Keep ownership visible', group: 'cards' },
  { id: 'showParents', title: 'Show parent context', description: 'See the parent at a glance', group: 'cards' },
  { id: 'hideEmpty', title: 'Hide empty sections', description: 'Skip unused work item sections', group: 'workitems' },
  { id: 'expandDescriptions', title: 'Expand descriptions', description: 'Read without inner scrolling', group: 'workitems' },
];

export const GROUPS: { id: GroupId; title: string }[] = [
  { id: 'navigation', title: 'Navigation' },
  { id: 'cards', title: 'Cards' },
  { id: 'workitems', title: 'Work items' },
];

const LEGACY_LIBRARY_PRESET_IDS = new Set(['balanced', 'focus', 'compact']);
const RETIRED_BOARD_PRESET_IDS = ['board:original', 'board:equal'];
const KIWIFRUIT_BOARD_PROFILE: BoardProfile = {
  ...defaultBoardProfile(), equalColumns: true, compactHeader: true, compactCards: false, autoLoadItems: true,
};
export const BUILTIN_PRESETS: Preset[] = [
  { id: 'board:kiwifruit', name: 'kiwifruit', board: decodeBoardProfile(KIWIFRUIT_BOARD_PROFILE) },
];
const KIWIFRUIT_TICKET_PROFILE: TicketProfile = {
  hiddenTargets: [
    'field:custom.priorityranking',
    'field:custom.riskassessment',
    'field:label/details/planning/activity',
    'field:label/details/planning/classification',
    'field:label/details/planning/priority ranking',
    'field:label/details/planning/resolution reason',
    'field:label/details/planning/severity',
    'field:label/details/planning/stack rank',
    'field:label/details/planning/sub classification',
    'field:microsoft.vsts.common.risk',
    'field:microsoft.vsts.scheduling.completedwork',
    'field:microsoft.vsts.scheduling.duedate',
    'field:microsoft.vsts.scheduling.originalestimate',
    'field:microsoft.vsts.scheduling.remainingwork',
    'field:microsoft.vsts.scheduling.startdate',
    'field:microsoft.vsts.scheduling.targetdate',
    'field:scrum_custom.status',
    'group:contribution/ms-1es.agency.copilot-workitem-group',
    'group:contribution/ms-eswm.witoneclickactions.work-item-oneclick-group-hub',
    'group:details/agency',
    'group:details/classification',
    'group:details/cross ado pr links active',
    'group:details/cross ado pr links completed',
    'group:details/effort (hours)',
    'group:details/icm',
    'group:details/oneclick actions',
    'group:details/risk assessment comment',
    'group:details/s360',
    'group:details/service details',
    'group:details/status',
    'group:details/system info@label%3Acreated%20by%7Clabel%3Aenvironment%20type%7Clabel%3Afound%20in%20build%7Clabel%3Afound%20in%20environment%7Clabel%3Ahow%20found%7Clabel%3Aintegrated%20in%20build%7Clabel%3Aregression%7Clabel%3Asafe%20deployment%20location',
    'group:details/system info@label%3Asystem%20info',
    'page:contribution/sariftools.scans.workitem-tab',
    'page:exception handling',
    'page:scans',
    'page:team',
  ],
  cardLayouts: {
    'page:details': [
      [
        'group:details/description',
        'group:details/acceptance criteria',
        'group:details/risk assessment comment',
        'group:details/cross ado pr links active',
        'group:details/cross ado pr links completed',
        'group:details/discussion',
      ],
      [
        'group:details/classification',
        'group:contribution/ms-eswm.witoneclickactions.work-item-oneclick-group-hub',
        'group:contribution/ms-1es.agency.copilot-workitem-group',
        'group:details/planning',
        'group:details/development',
        'group:details/related work',
        'group:details/deployment',
      ],
      [
        'group:details/s360',
        'group:details/icm',
        'group:details/service details',
      ],
    ],
  },
  viewMode: 'workspace',
  workspaceLayouts: {
    'page:details': [
      [
        'group:details/description',
        'group:details/system info@label%3Asystem%20info',
        'group:details/risk assessment comment',
        'group:details/cross ado pr links active',
        'group:details/cross ado pr links completed',
        'group:details/repro steps',
        'group:details/acceptance criteria',
        'group:details/discussion',
      ],
      [
        'group:details/planning',
        'group:details/effort (hours)',
        'group:details/status',
        'group:details/oneclick actions',
        'group:details/agency',
        'group:details/related work',
        'group:details/development',
        'group:details/deployment',
        'group:details/s360',
        'group:details/system info@label%3Acreated%20by%7Clabel%3Aenvironment%20type%7Clabel%3Afound%20in%20build%7Clabel%3Afound%20in%20environment%7Clabel%3Ahow%20found%7Clabel%3Aintegrated%20in%20build%7Clabel%3Aregression%7Clabel%3Asafe%20deployment%20location',
        'group:details/icm',
        'group:details/service details',
        'group:details/classification',
        'group:contribution/ms-eswm.witoneclickactions.work-item-oneclick-group-hub',
        'group:contribution/ms-1es.agency.copilot-workitem-group',
      ],
      [],
    ],
  },
};
export const TICKET_BUILTIN_PRESETS: Preset[] = [
  { id: 'ticket:kiwifruit', name: 'kiwifruit', ticket: decodeTicketProfile(KIWIFRUIT_TICKET_PROFILE) },
];

export function copyAppearance(value: Appearance): Appearance {
  return { density: value.density, features: { ...value.features } };
}

export function defaultView(): StoredView & { board: BoardProfile } {
  return { presetId: 'board:kiwifruit', appearance: { density: 'comfortable', features: { ...DEFAULT_FEATURES } },
    board: decodeBoardProfile(KIWIFRUIT_BOARD_PROFILE) };
}

export function defaultPreferences(): Preferences {
  return { version: 11, revision: 0, enabled: true, theme: 'light', scope: 'all', savedPresets: [], views: { all: defaultView() },
    ticket: { presetId: 'ticket:kiwifruit', ...decodeTicketProfile(KIWIFRUIT_TICKET_PROFILE), savedPresets: [], layoutLocked: false, undo: null } };
}
export function effectiveBoardView(preferences: Preferences, context: AdoContext | null): StoredView & { board: BoardProfile } {
  for (const scope of ['board', 'project', 'organization', 'all'] as const) {
    const key = scopeKey(scope, context);
    const view = key ? preferences.views[key] : undefined;
    if (view?.board) return { ...view, board: view.board };
  }
  return defaultView();
}

export function defaultTicketProfile(): TicketProfile {
  return { ...emptyTicketVisibility(), cardLayouts: {}, viewMode: 'native', workspaceLayouts: {} };
}
export function ticketLayouts(ticket: TicketProfile): CardLayouts {
  return ticket.viewMode === 'workspace' ? ticket.workspaceLayouts : ticket.cardLayouts;
}
export function decodeTicketProfile(value: unknown, version = 6): TicketProfile {
  const visibility = decodeTicketVisibility(value);
  if (!isObject(value)) throw new Error('Invalid Ticket profile.');
  const viewMode = version < 6 ? 'native' : value.viewMode;
  if (viewMode !== 'native' && viewMode !== 'workspace') throw new Error('Invalid Ticket view.');
  return { ...visibility, cardLayouts: version < 4 ? {} : decodeCardLayouts(value.cardLayouts),
    viewMode, workspaceLayouts: version < 6 ? {} : decodeWorkspaceLayouts(value.workspaceLayouts) };
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid stored ${field}.`);
  return value;
}

function appearance(value: unknown): Appearance {
  if (!isObject(value) || !isObject(value.features) || (value.density !== 'comfortable' && value.density !== 'compact')) {
    throw new Error('Invalid stored appearance preferences.');
  }
  const features = { ...DEFAULT_FEATURES };
  for (const id of Object.keys(DEFAULT_FEATURES) as FeatureId[]) {
    const flag = value.features[id];
    if (typeof flag !== 'boolean') throw new Error(`Invalid stored preference: ${id}.`);
    features[id] = flag;
  }
  return { density: value.density, features };
}

export function decodePreferences(value: unknown): Preferences {
  if (!isObject(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5 && value.version !== 6 && value.version !== 7 && value.version !== 8 && value.version !== 9 && value.version !== 10 && value.version !== 11)) throw new Error('Unsupported preferences version. Reset preferences to recover.');
  const version = value.version;
  const retirePresets = version < 11;
  const revision = value.version < 5 ? 0 : value.revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid preferences revision.');
  const enabled = value.version === 1 ? value.readerEnabled : value.enabled;
  const theme = value.theme;
  const scope = value.scope;
  if (typeof enabled !== 'boolean' || (theme !== 'light' && theme !== 'dark') ||
    (scope !== 'all' && scope !== 'organization' && scope !== 'project' && scope !== 'board') ||
    !Array.isArray(value.savedPresets) || !isObject(value.views)) {
    throw new Error('Invalid stored preferences. Reset preferences to recover.');
  }
  const ids = new Set([...BUILTIN_PRESETS.map(preset => preset.id), ...RETIRED_BOARD_PRESET_IDS]);
  const names = new Set<string>(retirePresets ? [] : BUILTIN_PRESETS.map(preset => preset.name.toLowerCase()));
  const legacyPresets = value.savedPresets.map(item => {
    if (!isObject(item)) throw new Error('Invalid stored preset.');
    const id = string(item.id, 'preset ID');
    const name = string(item.name, 'preset name');
    if (ids.has(id) || names.has(name.toLowerCase())) throw new Error('Duplicate stored presets.');
    ids.add(id);
    names.add(name.toLowerCase());
    if (item.appearance === undefined && item.ticket === undefined && item.board === undefined) throw new Error('A preset has no settings snapshot.');
    return { id, name, ...(item.appearance !== undefined ? { appearance: appearance(item.appearance) } : {}),
      ...(item.appearance !== undefined || item.board !== undefined ? { board: version < 7 ? defaultBoardProfile() : decodeBoardProfile(item.board, version) } : {}),
      ...(item.ticket !== undefined ? { ticket: decodeTicketProfile(item.ticket, version) } : {}) };
  });
  const savedPresets = legacyPresets.filter(preset => preset.board).map(preset => ({
    id: preset.id, name: preset.name, ...(preset.appearance ? { appearance: preset.appearance } : {}), board: preset.board,
  }));
  const views: Record<string, StoredView> = {};
  for (const [key, item] of Object.entries(value.views)) {
    if (key !== 'all' && !/^(organization|project|board):/.test(key)) throw new Error('Invalid stored scope.');
    if (!isObject(item)) throw new Error('Invalid stored view.');
    const previousPreset = string(item.presetId, 'selected preset');
    const legacyBuiltin = version < 7 && LEGACY_LIBRARY_PRESET_IDS.has(previousPreset);
    const presetId = legacyBuiltin ? 'board:original' : previousPreset;
    if (!(retirePresets && RETIRED_BOARD_PRESET_IDS.includes(presetId)) &&
      ![...BUILTIN_PRESETS, ...savedPresets].some(preset => preset.id === presetId && preset.board)) {
      throw new Error('A stored view refers to an unavailable Library preset.');
    }
    views[key] = { presetId: retirePresets ? 'board:kiwifruit' : presetId, appearance: appearance(item.appearance),
      board: version < 7 || item.board === null ? null : decodeBoardProfile(item.board, version) };
  }
  if (retirePresets && !views.all?.board) {
    views.all = { ...(views.all ?? defaultView()), board: defaultBoardProfile() };
  }
  const ticket = value.version === 1 ? { presetId: 'balanced', hiddenTargets: [] } : value.ticket;
  if (!isObject(ticket)) throw new Error('Invalid Ticket settings.');
  const rawTicketPresets = value.version >= 3 ? ticket.savedPresets : legacyPresets.filter(preset => preset.ticket);
  if (!Array.isArray(rawTicketPresets)) throw new Error('Invalid Ticket presets.');
  const ticketIds = new Set([...TICKET_BUILTIN_PRESETS.map(preset => preset.id), 'ticket:default']);
  const ticketNames = new Set<string>(retirePresets ? [] : TICKET_BUILTIN_PRESETS.map(preset => preset.name.toLowerCase()));
  const ticketPresets = rawTicketPresets.map(item => {
    if (!isObject(item)) throw new Error('Invalid stored Ticket preset.');
    const id = string(item.id, 'Ticket preset ID');
    const name = string(item.name, 'Ticket preset name');
    if (ticketIds.has(id) || ticketNames.has(name.toLowerCase())) throw new Error('Duplicate Ticket presets.');
    ticketIds.add(id); ticketNames.add(name.toLowerCase());
    return { id, name, ticket: decodeTicketProfile(item.ticket, version) };
  });
  const previousTicketId = string(ticket.presetId, 'Ticket preset');
  const ticketPresetId = value.version < 3 && previousTicketId === 'balanced' ? 'ticket:default' : previousTicketId;
  if (!(retirePresets && ticketPresetId === 'ticket:default') &&
    ![...TICKET_BUILTIN_PRESETS, ...ticketPresets].some(preset => preset.id === ticketPresetId)) {
    throw new Error('The Ticket layout refers to an unavailable preset.');
  }
  const layoutLocked = value.version < 5 ? false : ticket.layoutLocked;
  if (typeof layoutLocked !== 'boolean') throw new Error('Invalid layout lock.');
  let undo: TicketUndo | null = null;
  if (value.version >= 5 && ticket.undo !== null) {
    if (!isObject(ticket.undo) || (ticket.undo.kind !== 'layout' && ticket.undo.kind !== 'visibility' && ticket.undo.kind !== 'preset') ||
      !isObject(ticket.undo.previous)) throw new Error('Invalid Ticket undo.');
    const id = string(ticket.undo.id, 'undo ID');
    const presetId = string(ticket.undo.previous.presetId, 'undo preset');
    if (id.length > 128 || !ticketIds.has(presetId) || !retirePresets && presetId === 'ticket:default') throw new Error('Invalid Ticket undo identity.');
    undo = { id, kind: ticket.undo.kind, previous: { presetId: retirePresets ? 'ticket:kiwifruit' : presetId,
      ...decodeTicketProfile(ticket.undo.previous, value.version) } };
  }
  return {
    version: 11,
    revision,
    enabled,
    theme,
    scope,
    savedPresets: retirePresets ? [] : savedPresets,
    views,
    ticket: { presetId: retirePresets ? 'ticket:kiwifruit' : ticketPresetId, ...decodeTicketProfile(ticket, value.version),
      savedPresets: retirePresets ? [] : ticketPresets, layoutLocked, undo },
  };
}

export type PreferenceAction =
  | { kind: 'patch'; theme?: Theme; enabled?: boolean; scope?: Scope }
  | { kind: 'feature'; viewKey: string; id: FeatureId; checked: boolean }
  | { kind: 'density'; viewKey: string; density: Density }
  | { kind: 'board-columns'; viewKey: string; equal: boolean }
  | { kind: 'board-autoload'; viewKey: string; enabled: boolean }
  | { kind: 'board-presentation'; viewKey: string; feature: BoardPresentationFeature; enabled: boolean }
  | { kind: 'board-card-field'; viewKey: string; field: BoardCardField; visible: boolean }
  | { kind: 'apply-preset'; area: TicketArea; presetId: string; viewKey?: string }
  | { kind: 'save-preset'; area: TicketArea; id: string; name: string; viewKey?: string; replace?: boolean }
  | { kind: 'ticket-target'; key: string; hidden: boolean }
  | { kind: 'ticket-restore-cards'; keys: string[] }
  | { kind: 'ticket-view'; viewMode: TicketViewMode }
  | { kind: 'ticket-card-move'; viewMode?: TicketViewMode; page: string; key: string; column: CardColumn; before: string | null; native: CardLayout }
  | { kind: 'ticket-layout-lock'; locked: boolean }
  | { kind: 'undo-ticket'; id: string }
  | { kind: 'replace-configuration'; preferences: Preferences; expectedRevision: number }
  | { kind: 'restore-configuration'; backupId: string; expectedRevision: number }
  | { kind: 'reset-ticket-layout' }
  | { kind: 'reset-ticket' }
  | { kind: 'reset-all' }
  | { kind: 'initialize' };

function validViewKey(key: unknown): key is string {
  return typeof key === 'string' && (key === 'all' || /^(organization|project|board):/.test(key));
}
export function decodePreferenceAction(value: unknown): PreferenceAction {
  if (!isObject(value)) throw new Error('Invalid preferences action.');
  if (value.kind === 'initialize' || value.kind === 'reset-all' || value.kind === 'reset-ticket' || value.kind === 'reset-ticket-layout') return { kind: value.kind };
  if (value.kind === 'replace-configuration' || value.kind === 'restore-configuration') {
    if (typeof value.expectedRevision !== 'number' || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) throw new Error('Invalid configuration preview revision.');
    if (value.kind === 'replace-configuration') return { kind: value.kind, expectedRevision: value.expectedRevision, preferences: portablePreferences(value.preferences) };
    const backupId = string(value.backupId, 'backup ID');
    if (backupId.length > 128) throw new Error('Invalid backup ID.');
    return { kind: value.kind, expectedRevision: value.expectedRevision, backupId };
  }
  if (value.kind === 'ticket-restore-cards' && Array.isArray(value.keys) && value.keys.length > 0 && value.keys.length <= 300 &&
    value.keys.every(isCardKey) && new Set(value.keys).size === value.keys.length) return { kind: value.kind, keys: [...value.keys] };
  if (value.kind === 'ticket-layout-lock' && typeof value.locked === 'boolean') return { kind: value.kind, locked: value.locked };
  if (value.kind === 'ticket-view' && (value.viewMode === 'native' || value.viewMode === 'workspace')) return { kind: value.kind, viewMode: value.viewMode };
  if (value.kind === 'undo-ticket') {
    const id = string(value.id, 'undo ID');
    if (id.length > 128) throw new Error('Invalid undo ID.');
    return { kind: value.kind, id };
  }
  if (value.kind === 'ticket-card-move' && isPageKey(value.page) && isCardKey(value.key) &&
    isCardColumn(value.column) && (value.before === null || isCardKey(value.before))) {
    const native = decodeCardLayout(value.native);
    const viewMode = value.viewMode ?? 'native';
    if (viewMode !== 'native' && viewMode !== 'workspace') throw new Error('Invalid card view.');
    if (viewMode === 'workspace' && (value.column === 2 || native[2].length)) throw new Error('Workspace supports two card lanes.');
    if (!native.flat().includes(value.key) || value.before !== null && !native.flat().includes(value.before)) {
      throw new Error('The card move does not match the current form.');
    }
    return { kind: value.kind, viewMode, page: value.page, key: value.key, column: value.column, before: value.before, native };
  }
  if (value.kind === 'patch') {
    if (value.theme !== undefined && value.theme !== 'light' && value.theme !== 'dark') throw new Error('Invalid theme.');
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('Invalid enablement.');
    if (value.scope !== undefined && value.scope !== 'all' && value.scope !== 'organization' && value.scope !== 'project' && value.scope !== 'board') throw new Error('Invalid scope.');
    return { kind: 'patch', theme: value.theme, enabled: value.enabled, scope: value.scope };
  }
  if (value.kind === 'ticket-target' && isTargetKey(value.key) && typeof value.hidden === 'boolean') {
    return { kind: 'ticket-target', key: value.key, hidden: value.hidden };
  }
  if (value.kind === 'feature' && validViewKey(value.viewKey) && typeof value.id === 'string' &&
    FEATURES.some(feature => feature.id === value.id) && typeof value.checked === 'boolean') {
    const feature = FEATURES.find(feature => feature.id === value.id);
    if (!feature) throw new Error('Unknown feature.');
    return { kind: 'feature', viewKey: value.viewKey, id: feature.id, checked: value.checked };
  }
  if (value.kind === 'density' && validViewKey(value.viewKey) && (value.density === 'comfortable' || value.density === 'compact')) {
    return { kind: 'density', viewKey: value.viewKey, density: value.density };
  }
  if (value.kind === 'board-columns' && validViewKey(value.viewKey) && typeof value.equal === 'boolean') {
    return { kind: value.kind, viewKey: value.viewKey, equal: value.equal };
  }
  if (value.kind === 'board-autoload' && validViewKey(value.viewKey) && typeof value.enabled === 'boolean') {
    return { kind: value.kind, viewKey: value.viewKey, enabled: value.enabled };
  }
  if (value.kind === 'board-presentation' && validViewKey(value.viewKey) && isBoardPresentationFeature(value.feature) && typeof value.enabled === 'boolean') {
    return { kind: value.kind, viewKey: value.viewKey, feature: value.feature, enabled: value.enabled };
  }
  if (value.kind === 'board-card-field' && validViewKey(value.viewKey) && isBoardCardField(value.field) && typeof value.visible === 'boolean') {
    return { kind: value.kind, viewKey: value.viewKey, field: value.field, visible: value.visible };
  }
  if ((value.kind === 'apply-preset' || value.kind === 'save-preset') && (value.area === 'library' || value.area === 'ticket')) {
    if (value.area === 'library' && !validViewKey(value.viewKey)) throw new Error('A Library preset needs a valid scope.');
    const viewKey = typeof value.viewKey === 'string' ? value.viewKey : undefined;
    if (value.kind === 'apply-preset') return { kind: value.kind, area: value.area, presetId: string(value.presetId, 'preset'), viewKey };
    if (value.replace !== undefined && typeof value.replace !== 'boolean') throw new Error('Invalid preset replacement.');
    return { kind: value.kind, area: value.area, id: string(value.id, 'preset ID'), name: string(value.name, 'preset name'), viewKey, replace: value.replace };
  }
  throw new Error('Unknown or invalid preferences action.');
}

export function applyPreferenceAction(current: Preferences, action: PreferenceAction): Preferences {
  if (action.kind === 'reset-all') return defaultPreferences();
  if (action.kind === 'initialize') return current;
  if (action.kind === 'replace-configuration') {
    if (action.expectedRevision !== current.revision) throw new Error('Settings changed since the preview. Review the configuration again.');
    return portablePreferences(action.preferences);
  }
  if (action.kind === 'restore-configuration') throw new Error('Configuration backup restoration requires the settings writer.');
  if (action.kind === 'patch') {
    return { ...current, theme: action.theme ?? current.theme, enabled: action.enabled ?? current.enabled, scope: action.scope ?? current.scope };
  }
  if (action.kind === 'ticket-layout-lock') return { ...current, ticket: { ...current.ticket, layoutLocked: action.locked } };
  if (action.kind === 'ticket-view') return { ...current, ticket: { ...current.ticket, viewMode: action.viewMode } };
  if (action.kind === 'undo-ticket') {
    const undo = current.ticket.undo;
    if (!undo || undo.id !== action.id) throw new Error('A newer customization was saved. Nothing was undone.');
    return { ...current, ticket: { ...current.ticket, ...undo.previous, undo: null } };
  }
  if (action.kind === 'reset-ticket') return { ...current, ticket: { ...current.ticket, hiddenTargets: [] } };
  if (action.kind === 'reset-ticket-layout') {
    return { ...current, ticket: { ...current.ticket, ...(current.ticket.viewMode === 'workspace' ? { workspaceLayouts: {} } : { cardLayouts: {} }) } };
  }
  if (action.kind === 'ticket-card-move') {
    if (current.ticket.layoutLocked) throw new Error('Layout is locked. Unlock it before moving cards.');
    const viewMode = action.viewMode ?? 'native';
    if (viewMode !== current.ticket.viewMode) throw new Error('The Ticket view changed. The card move was cancelled.');
    if (viewMode === 'workspace' && (action.column === 2 || action.native[2].length)) throw new Error('Workspace supports two card lanes.');
    const layouts = ticketLayouts(current.ticket);
    const layout = resolveCardLayout(layouts[action.page], action.native);
    const moved = moveCard(layout, action.key, action.column, action.before);
    if (JSON.stringify(layout) === JSON.stringify(moved)) return current;
    const changed = { ...layouts, [action.page]: moved };
    return { ...current, ticket: { ...current.ticket, ...(viewMode === 'workspace' ? { workspaceLayouts: changed } : { cardLayouts: changed }) } };
  }
  if (action.kind === 'ticket-target') {
    const hidden = new Set(current.ticket.hiddenTargets);
    if (action.hidden) hidden.add(action.key); else hidden.delete(action.key);
    return { ...current, ticket: { ...current.ticket, hiddenTargets: [...hidden].sort() } };
  }
  if (action.kind === 'ticket-restore-cards') {
    const restored = new Set(action.keys);
    return { ...current, ticket: { ...current.ticket, hiddenTargets: current.ticket.hiddenTargets.filter(key => !restored.has(key)) } };
  }
  if (action.kind === 'board-columns') {
    const view = current.views[action.viewKey] ?? defaultView();
    return { ...current, views: { ...current.views, [action.viewKey]: { ...view, board: { ...(view.board ?? defaultView().board), equalColumns: action.equal } } } };
  }
  if (action.kind === 'board-autoload') {
    const view = current.views[action.viewKey] ?? defaultView();
    return { ...current, views: { ...current.views, [action.viewKey]: { ...view,
      board: { ...(view.board ?? defaultView().board), autoLoadItems: action.enabled } } } };
  }
  if (action.kind === 'board-presentation' || action.kind === 'board-card-field') {
    const view = current.views[action.viewKey] ?? defaultView();
    const board = decodeBoardProfile(view.board ?? defaultView().board);
    const next = action.kind === 'board-presentation' ? { ...board, [action.feature]: action.enabled } :
      { ...board, cardFields: { ...board.cardFields, [action.field]: action.visible } };
    return { ...current, views: { ...current.views, [action.viewKey]: { ...view, board: next } } };
  }
  if (action.kind === 'feature' || action.kind === 'density') {
    const view = current.views[action.viewKey] ?? defaultView();
    const next = action.kind === 'density' ? { ...view.appearance, density: action.density } :
      { ...view.appearance, features: { ...view.appearance.features, [action.id]: action.checked } };
    return { ...current, views: { ...current.views, [action.viewKey]: { ...view, appearance: next } } };
  }
  const savedBank = action.area === 'ticket' ? current.ticket.savedPresets : current.savedPresets;
  const builtins = action.area === 'ticket' ? TICKET_BUILTIN_PRESETS : BUILTIN_PRESETS;
  const presets = [...builtins, ...savedBank];
  if (action.kind === 'apply-preset') {
    const preset = presets.find(preset => preset.id === action.presetId);
    if (!preset) throw new Error('The preset is no longer available.');
    if (action.area === 'ticket') {
      if (!preset.ticket) throw new Error('This preset has no Ticket snapshot.');
      return { ...current, ticket: { ...current.ticket, presetId: preset.id, ...decodeTicketProfile(preset.ticket) } };
    }
    if (!preset.board || !action.viewKey) throw new Error('This preset has no Library snapshot or scope.');
    const view = current.views[action.viewKey] ?? defaultView();
    return { ...current, views: { ...current.views, [action.viewKey]: { presetId: preset.id,
      appearance: preset.appearance ? copyAppearance(preset.appearance) : copyAppearance(view.appearance), board: decodeBoardProfile(preset.board) } } };
  }
  const name = action.name.trim();
  if (!name) throw new Error('Enter a preset name.');
  const existing = savedBank.find(preset => preset.id === action.id);
  if (builtins.some(preset => preset.id === action.id)) throw new Error('Built-in presets cannot be overwritten.');
  if (action.replace && !existing) throw new Error('The selected preset is no longer available.');
  if (!action.replace && existing) throw new Error('A preset with this ID already exists.');
  if (presets.some(preset => preset.id !== action.id && preset.name.toLowerCase() === name.toLowerCase())) throw new Error('A preset with this name already exists.');
  const view = current.views[action.viewKey ?? 'all'] ?? defaultView();
  const snapshot = action.area === 'ticket' ? { ticket: decodeTicketProfile(current.ticket) } :
    { appearance: copyAppearance(view.appearance), board: decodeBoardProfile(view.board ?? defaultView().board) };
  const saved = { ...existing, id: action.id, name, ...snapshot };
  const savedPresets = [...savedBank.filter(preset => preset.id !== action.id), saved];
  return action.area === 'ticket' ? { ...current, ticket: { ...current.ticket, presetId: action.id, savedPresets } } :
    { ...current, savedPresets, views: { ...current.views, [action.viewKey ?? 'all']: {
      ...(current.views[action.viewKey ?? 'all'] ?? defaultView()), presetId: action.id,
      board: decodeBoardProfile(view.board ?? defaultView().board),
    } } };
}

export function ticketChangeMessage(kind: TicketChangeKind): string {
  return kind === 'layout' ? 'Layout saved' : kind === 'visibility' ? 'Visibility saved' : 'Preset applied';
}

export function preferenceSaveMessage(action: PreferenceAction): string {
  if (action.kind === 'board-presentation') return 'Board layout saved';
  if (action.kind === 'board-card-field') return 'Card fields saved';
  if (action.kind === 'board-autoload') return action.enabled ? 'Auto-loading enabled' : 'Auto-loading disabled';
  if (action.kind === 'board-columns') return action.equal ? 'Equal Board widths enabled' : 'Original Board widths restored';
  if (action.kind === 'replace-configuration') return 'Configuration imported';
  if (action.kind === 'restore-configuration') return 'Backup restored';
  if (action.kind === 'undo-ticket') return 'Change undone';
  if (action.kind === 'ticket-layout-lock') return action.locked ? 'Layout locked' : 'Layout unlocked';
  if (action.kind === 'ticket-view') return action.viewMode === 'workspace' ? 'Workspace enabled' : 'Original view restored';
  if (action.kind === 'ticket-card-move' || action.kind === 'reset-ticket-layout') return 'Layout saved';
  if (action.kind === 'ticket-target' || action.kind === 'ticket-restore-cards' || action.kind === 'reset-ticket') return 'Visibility saved';
  if (action.kind === 'apply-preset') return 'Preset applied';
  if (action.kind === 'save-preset') return 'Preset saved';
  return 'Settings saved';
}

export function commitPreferenceAction(current: Preferences, action: PreferenceAction, id: string): Preferences {
  const next = applyPreferenceAction(current, action);
  const kind: TicketChangeKind | null = action.kind === 'ticket-card-move' || action.kind === 'reset-ticket-layout' || action.kind === 'ticket-view' ? 'layout' :
    action.kind === 'ticket-target' || action.kind === 'ticket-restore-cards' || action.kind === 'reset-ticket' ? 'visibility' :
      action.kind === 'apply-preset' && action.area === 'ticket' ? 'preset' : null;
  const previous = { presetId: current.ticket.presetId, ...decodeTicketProfile(current.ticket) };
  if (!kind || JSON.stringify(previous) === JSON.stringify({ presetId: next.ticket.presetId, ...decodeTicketProfile(next.ticket) })) return next;
  return { ...next, ticket: { ...next.ticket, undo: { id, kind, previous } } };
}

export interface PreferencesBackend {
  read(): Promise<unknown>;
  write(value: Preferences, backup?: Preferences): Promise<void>;
}

export function createPreferencesStore(backend: PreferencesBackend) {
  let queue: Promise<void> = Promise.resolve();
  const load = async (): Promise<Preferences> => {
    const value = await backend.read();
    return value === undefined ? defaultPreferences() : decodePreferences(value);
  };
  return {
    load,
    update(updater: (current: Preferences) => Preferences | Promise<Preferences>, options: { backup?: boolean } = {}): Promise<Preferences> {
      const result = queue.then(async () => {
        const current = await load();
        const next = decodePreferences({ ...await updater(current), revision: current.revision + 1 });
        await backend.write(next, options.backup ? current : undefined);
        return next;
      });
      // Keep the queue usable after failure; the caller still receives the rejection.
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
    reset(): Promise<Preferences> {
      const result = queue.then(async () => {
        const raw = await backend.read();
        const revision = isObject(raw) && typeof raw.revision === 'number' && Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;
        const next = decodePreferences({ ...defaultPreferences(), revision: revision + 1 });
        await backend.write(next);
        return next;
      });
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
