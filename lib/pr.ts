import { parseAdoContext } from './context';
import { isObject } from './ticket';

export const PR_PORT = 'ado-customize/pr/v2';

export const PR_FEATURES = {
  splitOverview: { title: 'Split Overview into tabs', tab: 'overview',
    help: 'Overview becomes Activity (full-width feed), plus Description (with work items and tags) and Checks (with reviewers) tabs. The last tab you used is remembered.' },
  compactHeader: { title: 'Compact header', tab: 'overview',
    help: 'Tighter title, tab bar and Files toolbar. Applies to every PR tab.' },
  hideHeaderReviewers: { title: 'Hide header avatars', tab: 'overview',
    help: 'Remove the reviewer avatar strip next to the title. The Reviewers list in the sidebar stays.' },
  railStatus: { title: 'Merge status in sidebar', tab: 'overview',
    help: 'When Overview is not split: move the checks and policies card to the top of the right sidebar, and list work items before tags.' },
  hidePassedChecks: { title: 'Collapse passed checks', tab: 'overview',
    help: 'Only failing and pending policies stay open. Passed ones fold into an "N passed" button.' },
  collapseReviewers: { title: 'Collapse silent reviewers', tab: 'overview',
    help: 'Optional reviewers without a vote fold into a "+N with no vote" button. Required reviewers always stay.' },
  foldDescription: { title: 'Fold long description', tab: 'overview',
    help: 'When Overview is not split: descriptions taller than about 12 lines show a preview with Show more. Editing always shows the full text.' },
  foldUpdates: { title: 'Compact spacing', tab: 'overview',
    help: 'Reduce spacing around push and system events. Every update stays visible in its original order.' },
  compactPushes: { title: 'Commit preview', tab: 'overview',
    help: 'Preview the first two loaded commits in longer lists. Short lists stay unchanged. Show more commits reveals the remaining loaded rows; native links to all commits stay visible.' },
  hideTreeComments: { title: 'Hide comments in file tree', tab: 'files',
    help: 'Comment threads stop showing as rows in the changed-files tree. Comments stay in the diff.' },
  compactTree: { title: 'Compact file tree', tab: 'files',
    help: 'Half the indentation and tighter rows, so long paths fit in the tree.' },
  focusFiles: { title: 'Wide Files layout', tab: 'files',
    help: "Use a file drawer or bottom panel without hiding PR actions. Complete file lists get custom search. Large or collapsed trees keep native navigation and ADO's Filter inside the panel." },
} as const;
export type PrFeature = keyof typeof PR_FEATURES;
export type PrFlags = Record<PrFeature, boolean>;
export type PrFilesPosition = 'drawer' | 'bottom';
export interface PrProfile extends PrFlags { hiddenTabs: string[]; blockedAuthors: string[]; filesPosition: PrFilesPosition }
export const PR_FEATURE_IDS = Object.keys(PR_FEATURES) as PrFeature[];

// Tab ids are the native `__bolt-tab-<id>` suffix: stable contribution ids, not labels.
export const KIWIFRUIT_HIDDEN_TABS = [
  'updates',
  'cloudtest-1mrx-one-results',
  'ms-1es-Agency-sessions',
  'ms-azurecoreengineeringservices-pr-standard-questionnaire-pr-standard-questionnaire-tab',
  'XScenarios-PRInsights-Extension-PRInsights-Extension-Feature',
];
export const MAX_HIDDEN_TABS = 50;
export const MAX_BLOCKED_AUTHORS = 100;
export const MAX_AUTHOR_LENGTH = 128;

export function isPrFeature(value: unknown): value is PrFeature {
  return typeof value === 'string' && Object.hasOwn(PR_FEATURES, value);
}
export function isPrTabId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(value);
}
export function normalizeAuthor(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
export function authorKey(value: string): string {
  return normalizeAuthor(value).toLowerCase();
}
export function isAuthorName(value: unknown): value is string {
  return typeof value === 'string' && normalizeAuthor(value).length > 0 && normalizeAuthor(value).length <= MAX_AUTHOR_LENGTH;
}
export function kiwifruitPrProfile(): PrProfile {
  return { ...Object.fromEntries(PR_FEATURE_IDS.map(id => [id, true])) as PrFlags,
    filesPosition: 'drawer', hiddenTabs: [...KIWIFRUIT_HIDDEN_TABS], blockedAuthors: [] };
}
export function prFlagCount(profile: PrProfile): number {
  return PR_FEATURE_IDS.filter(id => profile[id]).length;
}
export function decodePrProfile(value: unknown): PrProfile {
  if (value === undefined) return kiwifruitPrProfile();
  if (!isObject(value)) throw new Error('Invalid pull request settings.');
  const profile = kiwifruitPrProfile();
  for (const id of PR_FEATURE_IDS) {
    if (value[id] === undefined) continue;
    if (typeof value[id] !== 'boolean') throw new Error(`Invalid pull request setting: ${id}.`);
    profile[id] = value[id];
  }
  if (value.filesPosition !== undefined) {
    if (value.filesPosition !== 'drawer' && value.filesPosition !== 'bottom') throw new Error('Invalid file navigation position.');
    profile.filesPosition = value.filesPosition;
  }
  if (value.hiddenTabs !== undefined) {
    if (!Array.isArray(value.hiddenTabs) || value.hiddenTabs.length > MAX_HIDDEN_TABS || !value.hiddenTabs.every(isPrTabId) ||
      new Set(value.hiddenTabs).size !== value.hiddenTabs.length) throw new Error('Invalid hidden pull request tabs.');
    profile.hiddenTabs = [...value.hiddenTabs];
  }
  if (value.blockedAuthors !== undefined) {
    if (!Array.isArray(value.blockedAuthors) || value.blockedAuthors.length > MAX_BLOCKED_AUTHORS || !value.blockedAuthors.every(isAuthorName) ||
      new Set(value.blockedAuthors.map(authorKey)).size !== value.blockedAuthors.length) throw new Error('Invalid blocked authors.');
    profile.blockedAuthors = value.blockedAuthors.map(normalizeAuthor);
  }
  return profile;
}
export function setHiddenTab(profile: PrProfile, id: string, hidden: boolean): PrProfile {
  const rest = profile.hiddenTabs.filter(item => item !== id);
  if (hidden && rest.length >= MAX_HIDDEN_TABS) throw new Error(`You can hide up to ${MAX_HIDDEN_TABS} tabs.`);
  return { ...profile, hiddenTabs: hidden ? [...rest, id] : rest };
}
export function setBlockedAuthor(profile: PrProfile, name: string, blocked: boolean): PrProfile {
  const key = authorKey(name);
  const rest = profile.blockedAuthors.filter(item => authorKey(item) !== key);
  if (blocked && rest.length >= MAX_BLOCKED_AUTHORS) throw new Error(`You can block up to ${MAX_BLOCKED_AUTHORS} authors.`);
  return { ...profile, blockedAuthors: blocked ? [...rest, normalizeAuthor(name)] : rest };
}

export type PrView = 'overview' | 'files' | 'other';
export interface PrAddress { key: string; view: PrView }
export function parsePullRequest(address: string): PrAddress | null {
  const context = parseAdoContext(address);
  if (context?.pageKind !== 'pullrequest') return null;
  const url = new URL(address);
  const id = /\/pullrequest\/([1-9]\d*)(?:\/|$)/i.exec(url.pathname)?.[1];
  if (!id) return null;
  const tab = (url.searchParams.get('_a') ?? 'overview').toLowerCase();
  return { key: `${context.host}/${context.organization ?? ''}/${id}`.toLowerCase(),
    view: tab === 'overview' ? 'overview' : tab === 'files' ? 'files' : 'other' };
}

export type PrStatus = 'none' | 'active' | 'original' | 'paused' | 'error';
export type PrFilterState = 'off' | 'waiting' | 'applied' | 'kept' | 'unavailable';
export interface PrTabState { id: string; label: string; selected: boolean; hidden: boolean }
export interface PrAuthorState { name: string; threads: number; blocked: boolean }
export interface PrSnapshot {
  version: 2;
  status: PrStatus;
  view: PrView | null;
  applied: PrFeature[];
  unsupported: PrFeature[];
  passedChecks: number;
  silentReviewers: number;
  treeComments: number;
  foldedUpdates: number;
  blockedThreads: number;
  descriptionFolded: boolean;
  filter: PrFilterState;
  tabs: PrTabState[];
  authors: PrAuthorState[];
  message: string | null;
}
export function emptyPrSnapshot(): PrSnapshot {
  return { version: 2, status: 'none', view: null, applied: [], unsupported: [], passedChecks: 0, silentReviewers: 0,
    treeComments: 0, foldedUpdates: 0, blockedThreads: 0, descriptionFolded: false, filter: 'off', tabs: [], authors: [], message: null };
}
const STATUSES: PrStatus[] = ['none', 'active', 'original', 'paused', 'error'];
const FILTERS: PrFilterState[] = ['off', 'waiting', 'applied', 'kept', 'unavailable'];
const COUNTS = ['passedChecks', 'silentReviewers', 'treeComments', 'foldedUpdates', 'blockedThreads'] as const;
function shortText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}
export function decodePrSnapshot(value: unknown): PrSnapshot {
  if (!isObject(value) || value.version !== 2 || !STATUSES.includes(value.status as PrStatus) ||
    !FILTERS.includes(value.filter as PrFilterState) || typeof value.descriptionFolded !== 'boolean' ||
    value.view !== null && value.view !== 'overview' && value.view !== 'files' && value.view !== 'other' ||
    value.message !== null && typeof value.message !== 'string' ||
    !Array.isArray(value.applied) || !value.applied.every(isPrFeature) ||
    !Array.isArray(value.unsupported) || !value.unsupported.every(isPrFeature)) throw new Error('Invalid pull request status.');
  for (const key of COUNTS) {
    if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid pull request counts.');
  }
  if (!Array.isArray(value.tabs) || value.tabs.length > 60 || !value.tabs.every(tab => isObject(tab) && isPrTabId(tab.id) &&
    shortText(tab.label, 200) && typeof tab.selected === 'boolean' && typeof tab.hidden === 'boolean')) throw new Error('Invalid pull request tabs.');
  if (!Array.isArray(value.authors) || value.authors.length > 200 || !value.authors.every(author => isObject(author) && isAuthorName(author.name) &&
    typeof author.threads === 'number' && Number.isSafeInteger(author.threads) && author.threads >= 0 && typeof author.blocked === 'boolean')) {
    throw new Error('Invalid pull request authors.');
  }
  return { version: 2, status: value.status as PrStatus, view: value.view as PrView | null,
    applied: [...value.applied], unsupported: [...value.unsupported], passedChecks: Number(value.passedChecks),
    silentReviewers: Number(value.silentReviewers), treeComments: Number(value.treeComments), foldedUpdates: Number(value.foldedUpdates),
    blockedThreads: Number(value.blockedThreads), descriptionFolded: value.descriptionFolded,
    filter: value.filter as PrFilterState,
    tabs: value.tabs.map(tab => { const item = tab as PrTabState; return { id: item.id, label: item.label, selected: item.selected, hidden: item.hidden }; }),
    authors: value.authors.map(author => { const item = author as PrAuthorState; return { name: item.name, threads: item.threads, blocked: item.blocked }; }),
    message: value.message };
}

export type FeedRowKind = 'composer' | 'comment' | 'update' | 'placeholder' | 'unknown';
