export type Scope = 'all' | 'organization' | 'project' | 'board';
export type PageKind = 'board' | 'taskboard' | 'backlog' | 'query' | 'workitems' | 'pullrequest' | 'other';

export function isPageKind(value: unknown): value is PageKind {
  return value === 'board' || value === 'taskboard' || value === 'backlog' ||
    value === 'query' || value === 'workitems' || value === 'pullrequest' || value === 'other';
}

export interface AdoContext {
  host: string;
  organization: string | null;
  project: string | null;
  boardPath: string | null;
  pageKind: PageKind;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseAdoContext(address: string): AdoContext | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' ||
    (url.hostname !== 'dev.azure.com' && !url.hostname.endsWith('.visualstudio.com'))) {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  const legacy = url.hostname.endsWith('.visualstudio.com');
  const organization = legacy ? url.hostname.split('.')[0] ?? null :
    (parts[0]?.startsWith('_') ? null : parts.shift() ?? null);
  if (legacy && parts[0] === 'DefaultCollection') parts.shift();
  const hubIndex = parts.findIndex(part => part.startsWith('_'));
  const project = hubIndex !== 0 && parts[0] && !parts[0].startsWith('_') ? parts[0] : null;
  const hub = hubIndex >= 0 ? parts[hubIndex] : undefined;
  const pageKind: PageKind = hub === '_boards' ? 'board' :
    hub === '_backlogs' || (hub === '_sprints' && parts[hubIndex + 1] === 'backlog') ? 'backlog' :
    hub === '_sprints' ? 'taskboard' : hub === '_queries' ? 'query' :
    hub === '_workitems' ? 'workitems' :
    hub === '_git' && parts[hubIndex + 2]?.toLowerCase() === 'pullrequest' && /^[1-9]\d*$/.test(parts[hubIndex + 3] ?? '') ? 'pullrequest' : 'other';
  return {
    host: url.hostname,
    organization,
    project,
    boardPath: pageKind === 'board' || pageKind === 'taskboard' || pageKind === 'backlog' ? parts.join('/') : null,
    pageKind,
  };
}

export function scopeKey(scope: Scope, context: AdoContext | null): string | null {
  if (scope === 'all') return 'all';
  if (!context?.organization) return null;
  const org = context.organization.toLowerCase();
  if (scope === 'organization') return `organization:${JSON.stringify([org])}`;
  if (!context.project) return null;
  if (scope === 'project') return `project:${JSON.stringify([org, context.project.toLowerCase()])}`;
  if (!context.boardPath) return null;
  return `board:${JSON.stringify([org, context.boardPath.toLowerCase()])}`;
}
