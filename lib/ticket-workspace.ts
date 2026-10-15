import { normalizeLabel, rendered, RICH_EDITOR_SELECTOR, type TicketTarget } from './ticket';
import type { DragCard } from './ticket-drag';

export interface WorkspaceShell {
  host: HTMLElement;
  header: HTMLElement;
  titleRow: HTMLElement;
  commands: HTMLElement;
  comments: HTMLElement | null;
  formNavigation: HTMLElement | null;
  footer: HTMLElement;
  subheader: HTMLElement;
  navigation: HTMLElement;
  body: HTMLElement;
  flow: HTMLElement[];
  metadata: HTMLElement[];
}

function unique(elements: HTMLElement[]): HTMLElement | null {
  return elements.length === 1 ? elements[0] ?? null : null;
}
function directChild(element: HTMLElement, parent: HTMLElement): HTMLElement | null {
  while (element.parentElement && element.parentElement !== parent) element = element.parentElement;
  return element.parentElement === parent ? element : null;
}

export function workspaceShell(root: HTMLElement, grid: HTMLElement): WorkspaceShell | null {
  const headers = [...root.querySelectorAll<HTMLElement>('.work-item-form-header')].filter(rendered);
  const header = unique(headers);
  const title = header?.querySelector<HTMLElement>('.work-item-title-textfield');
  const commands = header?.querySelector<HTMLElement>('.work-item-header-command-bar[role="menubar"]');
  const comments = header ? unique([...header.querySelectorAll<HTMLElement>('.wif-comment-count-link')].filter(rendered)) : null;
  const owner = header?.querySelector<HTMLElement>('.work-item-assignment-dropdown')?.closest<HTMLElement>('.bolt-identitypickerdropdown')?.parentElement;
  const tags = header?.querySelector<HTMLElement>('.work-item-tag-picker');
  const subheader = unique([...root.querySelectorAll<HTMLElement>('.work-item-form-subheader')].filter(rendered));
  const nodes = subheader?.querySelector<HTMLElement>(':scope > .wif-node-dropdowns');
  const navigation = subheader?.querySelector<HTMLElement>(':scope > .wif-tabbar-container');
  const state = subheader ? unique([...subheader.children].filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child.matches('.flex-column') && child !== nodes && child !== navigation && rendered(child))) : null;
  const body = grid.closest<HTMLElement>('.work-item-form-page-content');
  const host = header?.closest<HTMLElement>('.work-item-form-page');
  const formNavigation = host ? unique([...host.querySelectorAll<HTMLElement>(':scope > .work-item-form-nav-bar')].filter(rendered)) : null;
  const titleRow = header && title ? directChild(title, header) : null;
  const footer = header && commands ? directChild(commands, header) : null;
  if (!host || !root.contains(host) && root !== host || !header || !titleRow || !commands || !owner || !tags ||
    !subheader || !nodes || !navigation || !state || !body || !host.contains(body) || !footer) return null;
  const metadata = [owner, state, nodes, tags];
  for (const element of [...metadata, commands, ...(comments ? [comments] : [])]) {
    if (!rendered(element)) continue;
    for (let parent = element.parentElement; parent && parent !== host; parent = parent.parentElement) {
      if (getComputedStyle(parent).position !== 'static') return null;
    }
  }
  const flow: HTMLElement[] = [];
  for (let parent: HTMLElement | null = body; parent && parent !== host; parent = parent.parentElement) flow.push(parent);
  if (!flow.some(parent => parent.contains(subheader))) return null;
  return { host, header, titleRow, commands, comments, formNavigation, footer, subheader, navigation, body, flow, metadata };
}

export function workspaceMain(card: DragCard, targets: TicketTarget[]): boolean {
  const semantic = normalizeLabel(card.label);
  if (['description', 'acceptance criteria', 'discussion'].includes(semantic)) return true;
  const group = targets.find(target => target.kind === 'group' && target.key === card.key);
  if (group && targets.some(target => target.parentId === group.id &&
    ['system.description', 'microsoft.vsts.common.acceptancecriteria', 'microsoft.vsts.tcm.reprosteps',
      'microsoft.vsts.tcm.systeminfo'].includes(target.fieldRef?.toLowerCase() ?? ''))) return true;
  return card.column === 0 && Boolean(card.element.querySelector(RICH_EDITOR_SELECTOR));
}

export function workspaceField(control: HTMLElement): HTMLElement | null {
  if (control.querySelector(`${RICH_EDITOR_SELECTOR},textarea,iframe,[role="textbox"]:not(input)`)) return null;
  let children = [...control.children].filter((child): child is HTMLElement => child instanceof HTMLElement && rendered(child));
  let wrapper = control;
  if (children.length === 1 && children[0]?.matches('.work-item-form-control-content-wrapper')) {
    wrapper = children[0];
    children = [...wrapper.children].filter((child): child is HTMLElement => child instanceof HTMLElement && rendered(child));
  }
  const label = children[0];
  if (children.length !== 2 || !label || !children[1]) return null;
  const labelOnly = label.matches('.work-item-control-label, .workitemcontrol-label, label') ||
    label.matches('.flex-row') && Boolean(label.querySelector(':scope > .workitemcontrol-label, :scope > .work-item-control-label, :scope > label'));
  return labelOnly && !label.querySelector('input, select, button, [role="button"]') ? wrapper : null;
}
