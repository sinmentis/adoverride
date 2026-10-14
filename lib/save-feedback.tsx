import { createRoot, type Root } from 'react-dom/client';
import { BaseStyles, Button, Flash, IconButton, Spinner, Text, ThemeProvider } from '@primer/react';
import { CheckIcon, XIcon } from '@primer/octicons-react';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { Theme } from './preferences';

export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
  undoId: string | null;
}
export const idleSaveState = (): SaveState => ({ status: 'idle', message: '', undoId: null });
export interface SaveFeedbackUi {
  show(state: SaveState, theme: Theme): void;
  clear(): void;
  dispose(): void;
}

export function SaveFeedback({ state, onUndo, onDismiss, trustedOnly = false }: {
  state: SaveState; onUndo: (id: string) => void; onDismiss?: () => void; trustedOnly?: boolean;
}) {
  if (state.status === 'idle') return null;
  const undoId = state.undoId;
  return <Flash variant={state.status === 'error' ? 'danger' : state.status === 'saved' ? 'success' : 'default'}
    style={{ padding: 8, fontSize: 12, background: 'var(--bgColor-default, Canvas)', color: 'var(--fgColor-default, CanvasText)' }}>
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}
      role={state.status === 'error' ? 'alert' : 'status'} aria-live="polite">
      {state.status === 'saving' ? <Spinner size="small" /> : state.status === 'saved' ? <CheckIcon size={16} /> : null}
      <Text style={{ flex: '1 1 auto' }}>{state.message}</Text>
      {state.status === 'saved' && undoId && <Button size="small" variant="invisible" aria-label="Undo saved Ticket change"
        style={{ color: 'inherit' }} onClick={event => {
          if (!trustedOnly || event.isTrusted) onUndo(undoId);
        }}>Undo</Button>}
      {onDismiss && state.status !== 'saving' && <IconButton size="small" variant="invisible" icon={XIcon}
        unsafeDisableTooltip aria-label="Dismiss save feedback" style={{ color: 'inherit' }}
        onClick={event => { if (!trustedOnly || event.isTrusted) onDismiss(); }} />}
    </div>
  </Flash>;
}

export function createSaveFeedbackUi(context: ContentScriptContext, undo: (id: string) => Promise<void>): SaveFeedbackUi {
  let state = idleSaveState();
  let theme: Theme = 'light';
  let ui: ShadowRootContentScriptUi<Root> | null = null;
  let loading: Promise<void> | null = null;
  let disposed = false;
  let timer = 0;
  let fallback: HTMLElement | null = null;
  function clear() {
    window.clearTimeout(timer);
    state = idleSaveState();
    fallback?.remove(); fallback = null;
    if (ui?.mounted) ui.mounted.render(null);
  }
  function render() {
    if (!ui?.mounted || disposed) return;
    ui.mounted.render(<ThemeProvider colorMode={theme}><BaseStyles style={{ color: 'CanvasText' }}>
      <SaveFeedback state={state} trustedOnly onDismiss={clear} onUndo={id => {
        void undo(id).catch(reason => {
          console.error('[ADO Customize] Could not undo customization.', reason);
          show({ status: 'error', message: reason instanceof Error ? reason.message : 'Could not undo customization.', undoId: null }, theme);
        });
      }} />
    </BaseStyles></ThemeProvider>);
  }
  function show(next: SaveState, nextTheme: Theme) {
    if (disposed || JSON.stringify(state) === JSON.stringify(next) && theme === nextTheme) return;
    window.clearTimeout(timer);
    state = next; theme = nextTheme;
    if (next.status === 'saved') timer = window.setTimeout(clear, 8000);
    if (ui) { render(); return; }
    if (!loading) loading = createShadowRootUi(context, {
      name: 'ado-ticket-save-feedback', position: 'inline', anchor: 'body', append: 'last', inheritStyles: true,
      isolateEvents: ['click', 'dblclick', 'mousedown'],
      css: ':host{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(340px,calc(100vw - 32px));font:14px system-ui;}',
      onMount: container => createRoot(container), onRemove: root => root?.unmount(),
    }).then(created => {
      if (disposed) { created.remove(); return; }
      ui = created;
      ui.shadowHost.setAttribute('data-ado-ticket-ui', 'save-feedback');
      ui.mount();
      render();
    }).catch(reason => {
      console.error('[ADO Customize] Could not display save feedback.', reason);
      if (disposed) return;
      fallback?.remove();
      fallback = document.createElement('div');
      fallback.setAttribute('data-ado-ticket-ui', 'save-error');
      fallback.setAttribute('role', 'alert');
      fallback.textContent = 'Save controls could not be displayed. Open ADO Customize to check the saved change or use Undo.';
      Object.assign(fallback.style, { position: 'fixed', right: '16px', bottom: '16px', maxWidth: '340px', padding: '12px',
        background: 'Canvas', color: 'CanvasText', border: '1px solid #cf222e', borderRadius: '6px', zIndex: '2147483647', font: '14px system-ui' });
      document.body.append(fallback);
    }).finally(() => { loading = null; });
  }
  return { show, clear, dispose() { disposed = true; clear(); ui?.remove(); ui = null; } };
}
