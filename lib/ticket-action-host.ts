import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export function ticketActionContext(context: ContentScriptContext) {
  const listeners = new Set<() => void>();
  const scoped = new Proxy(context, {
    get(target, key) {
      if (key === 'onInvalidated') return (callback: () => void) => {
        const unsubscribe = target.onInvalidated(callback);
        listeners.add(unsubscribe);
        return unsubscribe;
      };
      return Reflect.get(target, key, target);
    },
  });
  return { context: scoped, release() { for (const unsubscribe of listeners) unsubscribe(); listeners.clear(); } };
}
