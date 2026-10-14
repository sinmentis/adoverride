import { isObject } from './ticket';
import { decodeAutoLoadSnapshot, emptyAutoLoadSnapshot, type AutoLoadSnapshot } from './board-auto-load';
import { emptyBoardPresentation, type BoardPresentation } from './board-presentation';

export const BOARD_PORT = 'ado-customize/board/v4';
export type BoardStatus = 'none' | 'original' | 'active' | 'unsupported' | 'paused' | 'error';
export interface BoardSnapshot {
  version: 4;
  status: BoardStatus;
  effective: boolean;
  columns: number;
  expanded: number;
  collapsed: number;
  availableWidth: number;
  trailingSpace: number;
  message: string | null;
  equalColumns: boolean;
  autoLoad: AutoLoadSnapshot;
  presentation: BoardPresentation;
}
export function emptyBoardSnapshot(): BoardSnapshot {
  return { version: 4, status: 'none', effective: false, columns: 0, expanded: 0, collapsed: 0,
    availableWidth: 0, trailingSpace: 0, message: null, equalColumns: false, autoLoad: emptyAutoLoadSnapshot(),
    presentation: emptyBoardPresentation() };
}
export function decodeBoardSnapshot(value: unknown): BoardSnapshot {
  if (!isObject(value) || value.version !== 4 || !['none', 'original', 'active', 'unsupported', 'paused', 'error'].includes(String(value.status)) ||
    typeof value.effective !== 'boolean' || typeof value.equalColumns !== 'boolean' || value.message !== null && typeof value.message !== 'string') throw new Error('Invalid Board status.');
  for (const property of ['columns', 'expanded', 'collapsed', 'availableWidth', 'trailingSpace'] as const) {
    if (typeof value[property] !== 'number' || !Number.isFinite(value[property]) || value[property] < 0) throw new Error('Invalid Board geometry.');
  }
  for (const property of ['columns', 'expanded', 'collapsed'] as const) {
    if (!Number.isSafeInteger(value[property])) throw new Error('Invalid Board column counts.');
  }
  const status = value.status;
  if (status !== 'none' && status !== 'original' && status !== 'active' && status !== 'unsupported' && status !== 'paused' && status !== 'error' ||
    typeof value.columns !== 'number' || typeof value.expanded !== 'number' || typeof value.collapsed !== 'number' ||
    typeof value.availableWidth !== 'number' || typeof value.trailingSpace !== 'number' ||
    value.columns !== value.expanded + value.collapsed || value.effective !== (status === 'active')) throw new Error('Invalid Board status.');
  const presentation = value.presentation;
  if (!isObject(presentation) || typeof presentation.compactCards !== 'boolean' || typeof presentation.compactHeader !== 'boolean' ||
    presentation.message !== null && typeof presentation.message !== 'string') throw new Error('Invalid Board presentation status.');
  for (const key of ['mappedCards', 'unsupportedCards', 'hiddenFields'] as const) {
    if (typeof presentation[key] !== 'number' || !Number.isSafeInteger(presentation[key]) || presentation[key] < 0) throw new Error('Invalid Board card counts.');
  }
  return { version: 4, status, effective: value.effective, columns: value.columns, expanded: value.expanded,
    collapsed: value.collapsed, availableWidth: value.availableWidth, trailingSpace: value.trailingSpace, message: value.message,
    equalColumns: value.equalColumns, autoLoad: decodeAutoLoadSnapshot(value.autoLoad),
    presentation: { compactCards: presentation.compactCards, compactHeader: presentation.compactHeader,
      mappedCards: Number(presentation.mappedCards), unsupportedCards: Number(presentation.unsupportedCards),
      hiddenFields: Number(presentation.hiddenFields), message: presentation.message } };
}
