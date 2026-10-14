import { isObject } from './ticket';

export const CARD_FIELDS = {
  assignee: 'Assignee',
  state: 'State',
  tags: 'Tags',
  storyPoints: 'Story Points',
  indicators: 'Child & link counts',
} as const;
export type BoardCardField = keyof typeof CARD_FIELDS;
export type BoardPresentationFeature = 'compactCards' | 'compactHeader';
export interface BoardProfile {
  equalColumns: boolean;
  autoLoadItems: boolean;
  compactCards: boolean;
  compactHeader: boolean;
  cardFields: Record<BoardCardField, boolean>;
}
export function defaultBoardProfile(): BoardProfile {
  return { equalColumns: false, autoLoadItems: false, compactCards: false, compactHeader: false,
    cardFields: { assignee: true, state: true, tags: true, storyPoints: true, indicators: true } };
}
export function isBoardCardField(value: unknown): value is BoardCardField {
  return typeof value === 'string' && Object.hasOwn(CARD_FIELDS, value);
}
export function isBoardPresentationFeature(value: unknown): value is BoardPresentationFeature {
  return value === 'compactCards' || value === 'compactHeader';
}
export function decodeBoardProfile(value: unknown, version = 11): BoardProfile {
  if (!isObject(value) || typeof value.equalColumns !== 'boolean') throw new Error('Invalid Board preferences.');
  const autoLoadItems = version < 8 ? false : value.autoLoadItems;
  if (typeof autoLoadItems !== 'boolean') throw new Error('Invalid Board auto-loading preference.');
  const defaults = defaultBoardProfile();
  if (version < 9) return { ...defaults, equalColumns: value.equalColumns, autoLoadItems };
  if (typeof value.compactCards !== 'boolean' || typeof value.compactHeader !== 'boolean' || !isObject(value.cardFields)) {
    throw new Error('Invalid Board presentation preferences.');
  }
  const cardFields = { ...defaults.cardFields };
  for (const key of Object.keys(CARD_FIELDS)) {
    if (!isBoardCardField(key) || typeof value.cardFields[key] !== 'boolean') throw new Error('Invalid Board card fields.');
    cardFields[key] = value.cardFields[key];
  }
  if (Object.keys(value.cardFields).some(key => !isBoardCardField(key))) throw new Error('Unknown Board card field.');
  return { equalColumns: value.equalColumns, autoLoadItems, compactCards: value.compactCards, compactHeader: value.compactHeader,
    cardFields };
}
