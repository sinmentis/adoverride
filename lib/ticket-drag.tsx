import { useLayoutEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDraggable, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
  type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { BaseStyles, IconButton, ThemeProvider } from '@primer/react';
import { Hand } from 'lucide-react';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { cardDropPosition, type CardColumn, type CardLayout } from './card-layout';
import type { Theme, TicketViewMode } from './preferences';
import type { LayoutTrace } from './layout-diagnostics';
import { ticketActionContext } from './ticket-action-host';

export interface DragCard {
  key: string;
  label: string;
  column: CardColumn;
  element: HTMLElement;
  header: HTMLElement;
  anchor: HTMLElement;
}
export interface CardDragSession {
  token: string;
  page: string;
  grid: HTMLElement;
  cards: DragCard[];
  native: CardLayout;
  layout: CardLayout;
  theme: Theme;
  disabled: boolean;
  viewMode: TicketViewMode;
  columns: CardColumn[];
}
export interface CardMove { key: string; column: CardColumn; before: string | null }
export interface TicketDragUi {
  update(session: CardDragSession | null): void;
  cancel(): void;
  dispose(): void;
}
type HandleUi = ShadowRootContentScriptUi<void>;
interface Binding { card: DragCard; ui: HandleUi | null; disposed: boolean }

export function createTicketDragUi(context: ContentScriptContext,
  commit: (session: CardDragSession, move: CardMove) => Promise<void>, trace: LayoutTrace = () => {},
  reportError?: (message: string) => void): TicketDragUi {
  let session: CardDragSession | null = null;
  let started: CardDragSession | null = null;
  let controllerHost: HTMLElement | null = null;
  let reactRoot: Root | null = null;
  let saving = false;
  let disposed = false;
  let generation = 0;
  let direction = '';
  let keyboardReference: string | null = null;
  let ghost: HTMLElement | null = null;
  let landing: HTMLElement | null = null;
  let alert: HTMLElement | null = null;
  const bindings = new Map<string, Binding>();

  function removeFeedback() {
    ghost?.remove(); ghost = null;
    landing?.remove(); landing = null;
    for (const binding of bindings.values()) {
      binding.card.element.removeAttribute('data-ado-ticket-drop');
      binding.card.element.removeAttribute('data-ado-ticket-drag-source');
      binding.ui?.shadowHost.removeAttribute('data-ado-ticket-dragging');
    }
  }
  function report(message: string) {
    trace('error', { message });
    if (reportError) { reportError(message); return; }
    alert?.remove();
    alert = document.createElement('div');
    alert.setAttribute('data-ado-ticket-ui', 'error');
    alert.setAttribute('role', 'alert');
    alert.textContent = message;
    Object.assign(alert.style, { position: 'fixed', right: '16px', bottom: '16px', maxWidth: '340px', padding: '12px',
      background: 'Canvas', color: 'CanvasText', border: '1px solid #cf222e', borderRadius: '6px', zIndex: '2147483647', font: '14px system-ui' });
    document.body.append(alert);
  }
  function dragPoint(event: DragMoveEvent | DragEndEvent) {
    const native = event.activatorEvent;
    const card = typeof event.active.id === 'string' ? bindings.get(event.active.id)?.card : undefined;
    const bounds = card?.element.getBoundingClientRect();
    return {
      x: (native instanceof MouseEvent ? native.clientX : bounds ? bounds.left + bounds.width / 2 : 0) + event.delta.x,
      y: (native instanceof MouseEvent ? native.clientY : bounds ? bounds.top + bounds.height / 2 : 0) + event.delta.y,
    };
  }
  const collisionDetection: CollisionDetection = args => {
    const containers = args.droppableContainers.filter(container => container.id !== args.active.id);
    const collisions = args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers: containers }) :
      closestCenter({ ...args, droppableContainers: containers });
    return collisions.sort((a, b) => Number(String(a.id).startsWith('column:')) - Number(String(b.id).startsWith('column:')));
  };
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context: dnd }) => {
    if (!session || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
    direction = event.code;
    const reference = keyboardReference ? bindings.get(keyboardReference)?.card :
      typeof dnd.active?.id === 'string' ? bindings.get(dnd.active.id)?.card : undefined;
    if (!reference) return;
    const bounds = reference.element.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    const candidates = session.cards.filter(card => card.key !== reference.key).map(card => {
      const box = card.element.getBoundingClientRect();
      return { key: card.key, x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }).filter(point => event.code === 'ArrowLeft' ? point.x < x - 1 : event.code === 'ArrowRight' ? point.x > x + 1 :
      event.code === 'ArrowUp' ? point.y < y - 1 : point.y > y + 1)
      .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
    const target = candidates[0];
    if (!target) return;
    keyboardReference = target.key;
    event.preventDefault();
    return { x: currentCoordinates.x + target.x - x, y: currentCoordinates.y + target.y - y };
  };

  function Handle({ binding, current }: { binding: Binding; current: CardDragSession }) {
    const { card } = binding;
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
      id: card.key, disabled: saving || current.disabled,
    });
    const { setNodeRef: setDropRef } = useDroppable({ id: card.key });
    useLayoutEffect(() => {
      setNodeRef(card.element); setDropRef(card.element);
      return () => { setNodeRef(null); setDropRef(null); };
    }, [card.element, setNodeRef, setDropRef]);
    if (!binding.ui) return null;
    return createPortal(
      <ThemeProvider colorMode={current.theme}><BaseStyles style={{ color: 'inherit', display: 'flex' }}>
        <IconButton icon={Hand} size="small" variant="invisible" {...attributes}
          ref={setActivatorNodeRef} aria-label={`Move ${card.label}`} title={`Move ${card.label}`}
          unsafeDisableTooltip disabled={saving || current.disabled}
          onPointerDown={event => { if (event.isTrusted) listeners?.onPointerDown?.(event); }}
          onKeyDown={event => { if (event.isTrusted) listeners?.onKeyDown?.(event); }}
          style={{ width: 28, height: 28, padding: 4, cursor: isDragging ? 'grabbing' : 'grab', color: 'inherit' }} />
      </BaseStyles></ThemeProvider>, binding.ui.uiContainer,
    );
  }
  function ColumnTarget({ column }: { column: CardColumn }) {
    const { setNodeRef, isOver } = useDroppable({ id: `column:${column}` });
    return <div ref={setNodeRef} style={{ flex: '1 1 0', display: 'grid', placeItems: 'center', background: 'Canvas',
      color: 'CanvasText', border: `2px ${isOver ? 'solid' : 'dashed'} #0969da`, borderRadius: 6 }}>
      Drop in column {column + 1}
    </div>;
  }
  function dropPlan(event: DragMoveEvent | DragEndEvent) {
    if (!session || !event.over || typeof event.active.id !== 'string') return null;
    const key = event.active.id;
    const targetId = String(event.over.id);
    const target = bindings.get(targetId)?.card ?? null;
    const after = event.activatorEvent instanceof KeyboardEvent ? !['ArrowUp', 'ArrowLeft'].includes(direction) :
      target ? dragPoint(event).y >= target.element.getBoundingClientRect().top + target.element.getBoundingClientRect().height / 2 : true;
    try {
      return { move: { key, ...cardDropPosition(session.layout, key, targetId, after) }, targetId, target, after };
    } catch (reason) {
      console.error('[ADOverride] The drop target changed.', reason);
      report('The drop target changed. Try moving the card again.');
      cancel();
      return null;
    }
  }
  function showDropFeedback(event: DragMoveEvent | DragEndEvent) {
    if (!started) return;
    const plan = dropPlan(event);
    for (const binding of bindings.values()) {
      if (binding.card !== plan?.target) binding.card.element.removeAttribute('data-ado-ticket-drop');
    }
    if (!plan) { landing?.remove(); landing = null; return; }
    if (plan.target) plan.target.element.setAttribute('data-ado-ticket-drop', plan.after ? 'after' : 'before');
    const label = bindings.get(plan.move.key)?.card.label;
    if (!label) { report('The dragged card changed. Try again.'); cancel(); return; }
    if (!landing) {
      landing = document.createElement('div');
      landing.setAttribute('data-ado-ticket-ui', 'drop-preview');
      landing.setAttribute('role', 'status');
      landing.setAttribute('aria-live', 'polite');
      Object.assign(landing.style, { position: 'fixed', pointerEvents: 'none', minHeight: '36px', padding: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        background: 'Canvas', color: 'CanvasText', border: '2px dashed #1f6feb', borderRadius: '6px',
        boxShadow: '0 2px 8px #0002', zIndex: '2147483646', font: '600 12px system-ui', textAlign: 'center' });
      document.body.append(landing);
    }
    const text = plan.target ?
      `Release to place ${label} ${plan.after ? 'after' : 'before'} ${plan.target.label} (column ${plan.move.column + 1})` :
      `Release to place ${label} at the end of column ${plan.move.column + 1}`;
    if (landing.textContent !== text) landing.textContent = text;
    landing.setAttribute('data-placement', plan.target ? plan.after ? 'after' : 'before' : 'end');
    const bounds = plan.target?.element.getBoundingClientRect() ?? event.over?.rect;
    if (bounds) {
      const left = Math.max(4, Math.min(window.innerWidth - 52, bounds.left));
      Object.assign(landing.style, { left: `${left}px`, width: `${Math.min(bounds.width, window.innerWidth - left - 4)}px` });
      const height = landing.getBoundingClientRect().height;
      const top = plan.target ? plan.after ? bounds.bottom + 2 : bounds.top - height - 2 : bounds.top - height - 4;
      landing.style.top = `${Math.max(4, Math.min(window.innerHeight - height - 4, top))}px`;
    }
  }
  function finish(event: DragEndEvent) {
    const current = session;
    const origin = started;
    if (!current || !origin || current.token !== origin.token) { started = null; removeFeedback(); return; }
    const plan = dropPlan(event);
    started = null;
    removeFeedback();
    if (!plan) return;
    saving = true;
    trace('drag-end', { ...plan.move, target: plan.targetId });
    render();
    void commit(current, plan.move).catch(reason => {
      console.error('[ADOverride] Could not save card arrangement.', reason);
      if (!disposed) report(reason instanceof Error ? reason.message : 'Could not save card arrangement.');
    }).finally(() => { saving = false; if (!disposed) render(); });
  }
  function Board({ current }: { current: CardDragSession }) {
    const [dragging, setDragging] = useState(false);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
      useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
    const bounds = current.grid.getBoundingClientRect();
    function start(event: DragStartEvent) {
      if (typeof event.active.id !== 'string' || saving || current.disabled) return;
      const binding = bindings.get(event.active.id);
      if (!binding) return;
      alert?.remove(); alert = null;
      started = current;
      trace('drag-start', { key: binding.card.key });
      direction = '';
      keyboardReference = null;
      setDragging(true);
      binding.ui?.shadowHost.setAttribute('data-ado-ticket-dragging', '');
      binding.card.element.setAttribute('data-ado-ticket-drag-source', '');
      ghost = document.createElement('div');
      ghost.setAttribute('data-ado-ticket-ui', 'drag-preview');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = binding.card.label;
      Object.assign(ghost.style, { position: 'fixed', pointerEvents: 'none', padding: '8px 12px', maxWidth: '220px',
        background: 'Canvas', color: 'CanvasText', border: '1px solid #0969da', borderRadius: '6px',
        boxShadow: '0 4px 12px #0003', zIndex: '2147483647', font: '600 14px system-ui' });
      document.body.append(ghost);
    }
    return <DndContext sensors={sensors} collisionDetection={collisionDetection}
      accessibility={{ container: controllerHost ?? undefined, restoreFocus: true,
        screenReaderInstructions: { draggable: 'Press Space to move a card, use arrow keys to choose another card, and press Space to drop. Escape cancels.' } }}
      onDragStart={start}
      onDragMove={event => {
        const point = dragPoint(event);
        trace('drag-move', { x: point.x, y: point.y });
        if (ghost) Object.assign(ghost.style, { left: `${point.x + 12}px`, top: `${point.y + 12}px` });
        showDropFeedback(event);
      }}
      onDragOver={showDropFeedback}
      onDragCancel={() => { trace('drag-cancel'); started = null; removeFeedback(); setDragging(false); }}
      onDragEnd={event => { setDragging(false); finish(event); }}>
      {[...bindings.values()].filter(binding => binding.ui && !binding.disposed).map(binding =>
        <Handle key={binding.card.key} binding={binding} current={current} />)}
      {dragging && <div data-ado-ticket-ui="drop-columns" style={{ position: 'fixed', left: Math.max(8, bounds.left),
        bottom: 12, width: Math.min(bounds.width, window.innerWidth - 16), height: 56, display: 'flex', gap: 12,
        pointerEvents: 'none', zIndex: 2147483646, font: '13px system-ui' }}>
        {current.columns.map(column => <ColumnTarget key={column} column={column} />)}
      </div>}
    </DndContext>;
  }
  function render() {
    if (!session || disposed) return;
    if (!reactRoot) {
      controllerHost = document.createElement('div');
      controllerHost.setAttribute('data-ado-ticket-ui', 'drag-controller');
      Object.assign(controllerHost.style, { position: 'fixed', width: '0', height: '0', zIndex: '2147483646' });
      document.body.append(controllerHost);
      reactRoot = createRoot(controllerHost);
    }
    reactRoot.render(<Board key={`${session.token}:${generation}`} current={session} />);
  }
  function mountHandle(card: DragCard) {
    const binding: Binding = { card, ui: null, disposed: false };
    bindings.set(card.key, binding);
    const scoped = ticketActionContext(context);
    void createShadowRootUi(scoped.context, { name: 'ado-ticket-drag-handle', position: 'inline', anchor: card.anchor,
      append: 'last', inheritStyles: true, isolateEvents: ['click', 'dblclick', 'mousedown'],
      css: ':host{display:inline-flex;flex:0 0 auto;align-items:center;align-self:center;vertical-align:middle;margin-inline-start:4px;} svg{width:16px;height:16px;}',
      onMount: () => {},
      onRemove: scoped.release,
    }).then(ui => {
      if (disposed || binding.disposed || !session || !card.anchor.isConnected) { ui.remove(); return; }
      binding.ui = ui;
      ui.shadowHost.setAttribute('data-ado-ticket-ui', 'handle');
      ui.mount();
      card.anchor.querySelector(':scope > ado-ticket-visibility-control')?.before(ui.shadowHost);
      trace('handle-mounted', { key: card.key });
      render();
    }).catch(reason => {
      scoped.release();
      console.error('[ADOverride] Could not mount card drag controls.', reason);
      if (!disposed && !binding.disposed) report(reason instanceof Error ? reason.message : 'Card dragging is unavailable.');
    });
  }
  function cancel() {
    trace('controller-cancel', { active: started ? 1 : 0 });
    started = null;
    generation++;
    removeFeedback();
    render();
  }
  function cancelWithEscape(event: KeyboardEvent) {
    if (!event.isTrusted || !started || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    trace('escape-cancel');
    cancel();
  }
  window.addEventListener('keydown', cancelWithEscape, true);
  return {
    update(next) {
      if (disposed) return;
      if (started && (!next || next.token !== started.token || next.disabled || next.cards.length !== started.cards.length ||
        JSON.stringify(next.layout) !== JSON.stringify(started.layout) ||
        next.cards.some(card => bindings.get(card.key)?.card.element !== card.element))) cancel();
      session = next;
      const cards = new Map((next?.cards ?? []).map(card => [card.key, card]));
      const removed: Binding[] = [];
      for (const [key, binding] of bindings) {
        const card = cards.get(key);
        if (!card || card.element !== binding.card.element || card.header !== binding.card.header || card.anchor !== binding.card.anchor) {
          trace('handle-removed', { key, reason: !card ? 'not-visible' : card.element !== binding.card.element ? 'card-replaced' :
            card.header !== binding.card.header ? 'header-replaced' : 'actions-replaced' });
          binding.disposed = true; removed.push(binding); bindings.delete(key);
        }
      }
      if (removed.length && reactRoot) flushSync(() => {
        if (next) render(); else reactRoot?.render(null);
      });
      for (const binding of removed) { binding.ui?.remove(); binding.card.element.removeAttribute('data-ado-ticket-drop'); }
      for (const card of cards.values()) {
        const existing = bindings.get(card.key);
        if (existing) existing.card = card; else mountHandle(card);
      }
      if (!next) {
        removeFeedback();
        reactRoot?.unmount(); reactRoot = null;
        controllerHost?.remove(); controllerHost = null;
        alert?.remove(); alert = null;
      } else render();
    },
    cancel,
    dispose() {
      window.removeEventListener('keydown', cancelWithEscape, true);
      disposed = true;
      started = null;
      removeFeedback();
      reactRoot?.unmount(); reactRoot = null;
      for (const binding of bindings.values()) { binding.disposed = true; binding.ui?.remove(); }
      bindings.clear();
      controllerHost?.remove(); controllerHost = null;
      alert?.remove(); alert = null;
    },
  };
}
