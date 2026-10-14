import { describe, expect, it } from 'vitest';
import { parseAdoContext, scopeKey } from './context';

describe('ADO context', () => {
  it('normalizes new and legacy host scopes', () => {
    const modern = parseAdoContext('https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories?workitem=123');
    const legacy = parseAdoContext('https://example.visualstudio.com/DefaultCollection/Platform/_boards/board/t/Team/Stories');
    expect(modern?.organization).toBe('example');
    expect(modern?.project).toBe('Platform');
    expect(scopeKey('project', modern)).toBe(scopeKey('project', legacy));
    expect(scopeKey('board', modern)).toBe(scopeKey('board', legacy));
  });

  it('ignores filters when determining a board scope', () => {
    const first = parseAdoContext('https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories?text=first');
    const second = parseAdoContext('https://dev.azure.com/example/Platform/_boards/board/t/Team/Stories?text=second');
    expect(scopeKey('board', first)).toBe(scopeKey('board', second));
  });

  it('recognizes work item views without treating queries or work items as boards', () => {
    const backlog = parseAdoContext('https://dev.azure.com/example/Platform/_backlogs/backlog/Team%20A/Stories?showParents=true&System.AssignedTo=%40me');
    expect(backlog?.pageKind).toBe('backlog');
    expect(backlog?.project).toBe('Platform');
    expect(backlog?.boardPath).toContain('Team A');
    expect(parseAdoContext('https://dev.azure.com/example/Platform/_sprints/backlog/Team')?.pageKind).toBe('backlog');
    expect(parseAdoContext('https://dev.azure.com/example/Platform/_sprints/taskboard/Team')?.pageKind).toBe('taskboard');
    for (const [hub, kind] of [['_queries', 'query'], ['_workitems', 'workitems']]) {
      const context = parseAdoContext(`https://dev.azure.com/example/Platform/${hub}`);
      expect(context?.pageKind).toBe(kind);
      expect(scopeKey('board', context)).toBeNull();
    }
  });

  it('rejects unrelated hosts and unavailable scopes', () => {
    expect(parseAdoContext('https://dev.azure.com.attacker.example/example/Platform')).toBeNull();
    expect(parseAdoContext('http://dev.azure.com/example/Platform')).toBeNull();
    expect(parseAdoContext('not a URL')).toBeNull();
    expect(scopeKey('all', null)).toBe('all');
    expect(scopeKey('board', parseAdoContext('https://dev.azure.com/example/Platform/_git/repo'))).toBeNull();
  });
});
