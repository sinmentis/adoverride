import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ActionList, ActionMenu, BaseStyles, IconButton, ThemeProvider } from '@primer/react';
import { EyeClosedIcon, EyeIcon } from '@primer/octicons-react';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { PreferenceAction, Theme } from './preferences';
import { ticketActionContext } from './ticket-action-host';

export interface VisibilityCard { key: string; label: string; element: HTMLElement; header: HTMLElement; anchor: HTMLElement }
export interface VisibilitySession {
  token: string;
  root: HTMLElement;
  cards: VisibilityCard[];
  hidden: { key: string; label: string }[];
  theme: Theme;
  disabled: boolean;
  locked: boolean;
}
export interface TicketVisibilityUi {
  update(session: VisibilitySession | null): void;
  dispose(): void;
}
interface Binding { card: VisibilityCard; ui: ShadowRootContentScriptUi<Root> | null; removed: boolean }

export function createTicketVisibilityUi(context: ContentScriptContext,
  commit: (token: string, action: PreferenceAction) => Promise<void>, report: (message: string) => void): TicketVisibilityUi {
  let session: VisibilitySession | null = null;
  let disposed = false;
  let saving = false;
  let menu: ShadowRootContentScriptUi<Root> | null = null;
  let mountingMenu = false;
  const bindings = new Map<string, Binding>();
  async function save(token: string, action: PreferenceAction) {
    saving = true; render();
    try { await commit(token, action); }
    catch (reason) {
      console.error('[ADOverride] Could not save card visibility.', reason);
      if (!disposed) report(reason instanceof Error ? reason.message : 'Could not save card visibility.');
    } finally { saving = false; render(); }
  }
  function HiddenMenu({ current }: { current: VisibilitySession }) {
    const [open, setOpen] = useState(false);
    const disabled = saving || current.disabled;
    return <ThemeProvider colorMode={current.theme}><BaseStyles style={{ color: 'CanvasText' }}>
      <ActionMenu open={open} onOpenChange={setOpen}>
        <ActionMenu.Button size="small" leadingVisual={EyeClosedIcon} disabled={disabled}
          style={{ background: 'Canvas', color: 'CanvasText' }}>Hidden ({current.hidden.length})</ActionMenu.Button>
        <ActionMenu.Overlay width="small" align="start" style={{ background: 'Canvas', color: 'CanvasText' }}>
          <ActionList>
            <ActionList.Group>
              <ActionList.GroupHeading>Hidden cards on this page</ActionList.GroupHeading>
              {current.hidden.map(card => <ActionList.Item key={card.key} disabled={disabled}
                onSelect={event => { if (event.isTrusted) { setOpen(false); void save(current.token, { kind: 'ticket-target', key: card.key, hidden: false }); } }}>
                <ActionList.LeadingVisual><EyeIcon /></ActionList.LeadingVisual>Show {card.label}
              </ActionList.Item>)}
            </ActionList.Group>
            <ActionList.Divider />
            <ActionList.Item disabled={disabled} onSelect={event => {
              if (event.isTrusted) { setOpen(false); void save(current.token, { kind: 'ticket-restore-cards', keys: current.hidden.map(card => card.key) }); }
            }}>Show all hidden cards</ActionList.Item>
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
    </BaseStyles></ThemeProvider>;
  }
  function render() {
    if (disposed) return;
    for (const binding of bindings.values()) {
      const current = session;
      if (!current || !binding.ui?.mounted) continue;
      binding.ui.mounted.render(<ThemeProvider colorMode={current.theme}><BaseStyles style={{ color: 'inherit', display: 'flex' }}>
        <IconButton icon={EyeClosedIcon} size="small" variant="invisible" unsafeDisableTooltip
          aria-label={`Hide ${binding.card.label}`} title={`Hide ${binding.card.label}`}
          disabled={saving || current.disabled}
          onClick={event => { if (event.isTrusted) void save(current.token, { kind: 'ticket-target', key: binding.card.key, hidden: true }); }}
          style={{ width: 28, height: 28, padding: 4, color: 'inherit' }} />
      </BaseStyles></ThemeProvider>);
    }
    if (menu?.mounted) {
      const current = session;
      menu.shadowHost.style.display = current?.hidden.length && !current.locked ? '' : 'none';
      if (!current?.hidden.length || current.locked) { menu.mounted.render(null); return; }
      const box = current.root.getBoundingClientRect();
      menu.shadowHost.style.left = `${Math.max(16, Math.min(window.innerWidth - 160, box.left + 16))}px`;
      menu.shadowHost.style.bottom = `${Math.max(16, window.innerHeight - Math.min(window.innerHeight, box.bottom) + 16)}px`;
      menu.mounted.render(<HiddenMenu key={current.token} current={current} />);
    }
  }
  function mount(card: VisibilityCard) {
    const binding: Binding = { card, ui: null, removed: false };
    bindings.set(card.key, binding);
    const scoped = ticketActionContext(context);
    void createShadowRootUi(scoped.context, { name: 'ado-ticket-visibility-control', position: 'inline', anchor: card.anchor,
      append: 'last', inheritStyles: true, isolateEvents: ['click', 'dblclick', 'mousedown'],
      css: ':host{display:inline-flex;flex:0 0 auto;align-items:center;align-self:center;vertical-align:middle;margin-inline-start:4px;} svg{width:16px;height:16px;}',
      onMount: container => createRoot(container), onRemove: root => { root?.unmount(); scoped.release(); },
    }).then(ui => {
      if (disposed || binding.removed || !session || session.locked || !card.anchor.isConnected) { ui.remove(); return; }
      binding.ui = ui;
      ui.shadowHost.setAttribute('data-ado-ticket-ui', 'visibility');
      ui.mount();
      card.anchor.querySelector(':scope > ado-ticket-drag-handle')?.after(ui.shadowHost);
      render();
    }).catch(reason => {
      scoped.release();
      console.error('[ADOverride] Could not mount card visibility controls.', reason);
      if (!disposed && !binding.removed) report('Card visibility controls could not be displayed. Use the Ticket tab.');
    });
  }
  function ensureMenu() {
    if (menu || mountingMenu || !session?.hidden.length || session.locked || disposed) return;
    mountingMenu = true;
    void createShadowRootUi(context, { name: 'ado-ticket-hidden-menu', position: 'inline', anchor: 'body', append: 'last', inheritStyles: true,
      isolateEvents: ['click', 'dblclick', 'mousedown', 'keydown', 'keyup'],
      css: ':host{position:fixed;left:16px;bottom:16px;z-index:2147483645;font:14px system-ui;max-width:calc(100vw - 32px);}',
      onMount: container => createRoot(container), onRemove: root => root?.unmount(),
    }).then(ui => {
      if (disposed) { ui.remove(); return; }
      menu = ui;
      ui.shadowHost.setAttribute('data-ado-ticket-ui', 'hidden-menu');
      ui.mount(); render();
    }).catch(reason => {
      console.error('[ADOverride] Could not display hidden cards.', reason);
      if (!disposed) report('Hidden cards could not be displayed. Use the Ticket tab to restore them.');
    }).finally(() => { mountingMenu = false; });
  }
  return {
    update(next) {
      if (disposed) return;
      session = next;
      const cards = new Map((next && !next.locked ? next.cards : []).map(card => [card.key, card]));
      for (const [key, binding] of bindings) {
        const card = cards.get(key);
        if (!card || card.element !== binding.card.element || card.anchor !== binding.card.anchor) {
          binding.removed = true; binding.ui?.remove(); bindings.delete(key);
        } else binding.card = card;
      }
      for (const card of cards.values()) if (!bindings.has(card.key)) mount(card);
      ensureMenu(); render();
    },
    dispose() {
      disposed = true;
      for (const binding of bindings.values()) { binding.removed = true; binding.ui?.remove(); }
      bindings.clear(); menu?.remove(); menu = null; session = null;
    },
  };
}
