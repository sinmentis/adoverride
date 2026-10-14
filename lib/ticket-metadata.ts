import { parseAdoContext } from './context';
import { isObject, matchTicketLayout, normalizeProcessLayout, normalizeWebXml, text, type TicketLayout } from './ticket';

export function createMetadataProvider(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, Promise<TicketLayout>>();
  const processCache = new Map<string, Promise<TicketLayout[]>>();
  async function request(url: URL, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const timeout = setTimeout(() => controller.abort(new Error('Form metadata timed out.')), 10000);
    try {
      const response = await fetcher(url.href, {
        method: 'GET', credentials: 'include', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', 'X-TFS-FedAuthRedirect': 'Suppress' },
      });
      if (!response.ok) throw new Error(`Form metadata returned HTTP ${response.status}.`);
      if (!response.headers.get('content-type')?.includes('json')) throw new Error('Form metadata requires an authenticated ADO session.');
      return await response.json();
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
    }
  }
  async function load(address: string, type: string, signal: AbortSignal): Promise<TicketLayout> {
    const context = parseAdoContext(address);
    if (!context?.organization || !context.project) throw new Error('The ticket has no supported project context.');
    const current = new URL(address);
    const orgBase = current.hostname === 'dev.azure.com' ? `/${encodeURIComponent(context.organization)}` : '';
    const projectBase = `${orgBase}/${encodeURIComponent(context.project)}`;
    const definitionUrl = new URL(`${projectBase}/_apis/wit/workitemtypes/${encodeURIComponent(type)}?api-version=7.1`, current.origin);
    const definition = await request(definitionUrl, signal);
    if (!isObject(definition)) throw new Error('Invalid work item type metadata.');
    if (typeof definition.xmlForm === 'string' && /<WebLayout(?:\s|>)/.test(definition.xmlForm)) {
      return normalizeWebXml(definition.xmlForm);
    }
    const reference = text(definition.referenceName, 'type reference');
    const project = await request(new URL(`${orgBase}/_apis/projects/${encodeURIComponent(context.project)}?includeCapabilities=true&api-version=7.1`, current.origin), signal);
    if (!isObject(project) || !isObject(project.capabilities) || !isObject(project.capabilities.processTemplate)) {
      throw new Error('Project metadata has no process definition.');
    }
    const process = text(project.capabilities.processTemplate.templateTypeId, 'process ID');
    const url = new URL(`${orgBase}/_apis/work/processes/${encodeURIComponent(process)}/workItemTypes/${encodeURIComponent(reference)}/layout?api-version=7.1`, current.origin);
    return normalizeProcessLayout(await request(url, signal));
  }
  return {
    async discover(address: string, native: TicketLayout, signal: AbortSignal): Promise<TicketLayout | null> {
      const context = parseAdoContext(address);
      if (!context?.organization || !context.project) throw new Error('The ticket has no supported project context.');
      const current = new URL(address);
      const orgBase = current.hostname === 'dev.azure.com' ? `/${encodeURIComponent(context.organization)}` : '';
      const key = JSON.stringify([context.organization.toLowerCase(), context.project.toLowerCase()]);
      let pending = processCache.get(key);
      if (!pending) {
        pending = (async () => {
          const project = await request(new URL(`${orgBase}/_apis/projects/${encodeURIComponent(context.project ?? '')}?includeCapabilities=true&api-version=7.1`, current.origin), signal);
          if (!isObject(project) || !isObject(project.capabilities) || !isObject(project.capabilities.processTemplate)) throw new Error('Project metadata has no process definition.');
          const process = text(project.capabilities.processTemplate.templateTypeId, 'process ID');
          const result = await request(new URL(`${orgBase}/_apis/work/processes/${encodeURIComponent(process)}/workItemTypes?api-version=7.1`, current.origin), signal);
          if (!isObject(result) || !Array.isArray(result.value)) throw new Error('Invalid form type metadata.');
          const references = result.value.filter(value => isObject(value) && value.isDisabled !== true).map(value => {
            if (!isObject(value)) throw new Error('Invalid work item type.');
            return text(value.referenceName, 'work item type reference');
          });
          const layouts: TicketLayout[] = [];
          let index = 0;
          await Promise.all(Array.from({ length: Math.min(3, references.length) }, async () => {
            while (index < references.length) {
              const reference = references[index++];
              if (!reference) continue;
              const url = new URL(`${orgBase}/_apis/work/processes/${encodeURIComponent(process)}/workItemTypes/${encodeURIComponent(reference)}/layout?api-version=7.1`, current.origin);
              layouts.push(normalizeProcessLayout(await request(url, signal)));
            }
          }));
          return layouts;
        })();
        processCache.set(key, pending);
        void pending.catch(() => { if (processCache.get(key) === pending) processCache.delete(key); });
      }
      return matchTicketLayout(native, await pending);
    },
    async get(address: string, type: string, signal: AbortSignal, refresh = false): Promise<TicketLayout> {
      if (signal.aborted) throw new Error('Form metadata request was cancelled.');
      const context = parseAdoContext(address);
      const key = JSON.stringify([context?.organization?.toLowerCase(), context?.project?.toLowerCase(), type]);
      if (refresh) cache.delete(key);
      let pending = cache.get(key);
      if (!pending) {
        const controller = new AbortController();
        const abort = () => controller.abort(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(() => controller.abort(new Error('Form metadata timed out.')), 10000);
        pending = load(address, type, controller.signal).finally(() => {
          clearTimeout(timeout);
          signal.removeEventListener('abort', abort);
        });
        cache.set(key, pending);
        void pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
      }
      return pending;
    },
    clear() { cache.clear(); processCache.clear(); },
  };
}
