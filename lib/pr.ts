import { parseAdoContext } from './context';
import { isObject } from './ticket';

export const PR_PORT = 'ado-customize/pr/v1';

export const PR_FEATURES = {
  compactHeader: { title: 'Compact header', tab: 'overview',
    help: 'Tighter title, tab bar and Files toolbar. Applies to every PR tab.' },
  railStatus: { title: 'Merge status in sidebar', tab: 'overview',
    help: 'Move the checks and policies card to the top of the right sidebar, and list work items before tags.' },
  hidePassedChecks: { title: 'Collapse passed checks', tab: 'overview',
    help: 'Only failing and pending policies stay open. Passed ones fold into an "N passed" button.' },
  collapseReviewers: { title: 'Collapse silent reviewers', tab: 'overview',
    help: 'Optional reviewers without a vote fold into a "+N with no vote" button. Required reviewers always stay.' },
  activeComments: { title: 'Start on active comments', tab: 'overview',
    help: 'Pick the native "Active comments" activity filter once when a PR opens. Your own choice is never overridden.' },
  hideTreeComments: { title: 'Hide comments in file tree', tab: 'files',
    help: 'Comment threads stop showing as rows in the changed-files tree. Comments stay in the diff.' },
  compactTree: { title: 'Compact file tree', tab: 'files',
    help: 'Half the indentation and tighter rows, so long paths fit in the tree.' },
} as const;
export type PrFeature = keyof typeof PR_FEATURES;
export type PrProfile = Record<PrFeature, boolean>;
export const PR_FEATURE_IDS = Object.keys(PR_FEATURES) as PrFeature[];

export function isPrFeature(value: unknown): value is PrFeature {
  return typeof value === 'string' && Object.hasOwn(PR_FEATURES, value);
}
export function kiwifruitPrProfile(): PrProfile {
  return Object.fromEntries(PR_FEATURE_IDS.map(id => [id, true])) as PrProfile;
}
export function nativePrProfile(): PrProfile {
  return Object.fromEntries(PR_FEATURE_IDS.map(id => [id, false])) as PrProfile;
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
  return profile;
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
export interface PrSnapshot {
  version: 1;
  status: PrStatus;
  view: PrView | null;
  applied: PrFeature[];
  unsupported: PrFeature[];
  passedChecks: number;
  silentReviewers: number;
  treeComments: number;
  filter: PrFilterState;
  message: string | null;
}
export function emptyPrSnapshot(): PrSnapshot {
  return { version: 1, status: 'none', view: null, applied: [], unsupported: [], passedChecks: 0, silentReviewers: 0,
    treeComments: 0, filter: 'off', message: null };
}
const STATUSES: PrStatus[] = ['none', 'active', 'original', 'paused', 'error'];
const FILTERS: PrFilterState[] = ['off', 'waiting', 'applied', 'kept', 'unavailable'];
export function decodePrSnapshot(value: unknown): PrSnapshot {
  if (!isObject(value) || value.version !== 1 || !STATUSES.includes(value.status as PrStatus) ||
    !FILTERS.includes(value.filter as PrFilterState) ||
    value.view !== null && value.view !== 'overview' && value.view !== 'files' && value.view !== 'other' ||
    value.message !== null && typeof value.message !== 'string' ||
    !Array.isArray(value.applied) || !value.applied.every(isPrFeature) ||
    !Array.isArray(value.unsupported) || !value.unsupported.every(isPrFeature)) throw new Error('Invalid pull request status.');
  for (const key of ['passedChecks', 'silentReviewers', 'treeComments'] as const) {
    if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid pull request counts.');
  }
  return { version: 1, status: value.status as PrStatus, view: value.view as PrView | null,
    applied: [...value.applied], unsupported: [...value.unsupported], passedChecks: Number(value.passedChecks),
    silentReviewers: Number(value.silentReviewers), treeComments: Number(value.treeComments),
    filter: value.filter as PrFilterState, message: value.message };
}
