import { browser } from 'wxt/browser';
import { parseAdoContext, type AdoContext } from './context';
import { decodeInspectionReply, INSPECT_MESSAGE, ReaderVersionError, type Inspection } from './inspector';
import { createPreferencesStore, decodePreferences, type PreferenceAction, type Preferences } from './preferences';
import { isObject } from './ticket';
import { LAYOUT_MESSAGE, decodeLayoutReply, type LayoutCommand } from './layout-diagnostics';
import { decodeBoardLayoutReply } from './board-layout-report';
import { CONFIGURATION_BACKUP_KEY, decodeConfigurationBackup, exportConfiguration, type ConfigurationBackup } from './configuration';

export const PREFERENCES_KEY = 'ado-customize.preferences.v11';
export const V10_PREFERENCES_KEY = 'ado-customize.preferences.v10';
export const V9_PREFERENCES_KEY = 'ado-customize.preferences.v9';
export const V8_PREFERENCES_KEY = 'ado-customize.preferences.v8';
export const V7_PREFERENCES_KEY = 'ado-customize.preferences.v7';
export const V6_PREFERENCES_KEY = 'ado-customize.preferences.v6';
export const PREVIOUS_PREFERENCES_KEY = 'ado-customize.preferences.v5';
export const OLDER_PREFERENCES_KEY = 'ado-customize.preferences.v4';
export const V3_PREFERENCES_KEY = 'ado-customize.preferences.v3';
export const V2_PREFERENCES_KEY = 'ado-customize.preferences.v2';
export const LEGACY_PREFERENCES_KEY = 'ado-customize.preferences.v1';
export const PREFERENCE_MESSAGE = 'ado-customize/preferences';

export const preferencesStore = createPreferencesStore({
  async read() {
    const keys = [PREFERENCES_KEY, V10_PREFERENCES_KEY, V9_PREFERENCES_KEY, V8_PREFERENCES_KEY, V7_PREFERENCES_KEY, V6_PREFERENCES_KEY, PREVIOUS_PREFERENCES_KEY, OLDER_PREFERENCES_KEY, V3_PREFERENCES_KEY, V2_PREFERENCES_KEY, LEGACY_PREFERENCES_KEY];
    const result = await browser.storage.local.get(keys);
    for (const key of keys) if (result[key] !== undefined) return result[key];
    return undefined;
  },
  async write(value, previous) {
    const backup: ConfigurationBackup | undefined = previous ? { kind: 'ado-customize-configuration-backup', version: 1,
      id: crypto.randomUUID(), configuration: exportConfiguration(previous) } : undefined;
    await browser.storage.local.set({ [PREFERENCES_KEY]: value, ...(backup ? { [CONFIGURATION_BACKUP_KEY]: backup } : {}) });
  },
});
export async function configurationBackup(): Promise<ConfigurationBackup | null> {
  const stored = await browser.storage.local.get(CONFIGURATION_BACKUP_KEY);
  const value: unknown = stored[CONFIGURATION_BACKUP_KEY];
  return value === undefined ? null : decodeConfigurationBackup(value);
}

export interface PreferenceCommit {
  preferences: Preferences;
  message: string;
  undoId: string | null;
}
export async function commitPreferences(action: PreferenceAction): Promise<PreferenceCommit> {
  const reply: unknown = await browser.runtime.sendMessage({ type: PREFERENCE_MESSAGE, action });
  if (!isObject(reply) || typeof reply.ok !== 'boolean') throw new Error('The settings writer returned an invalid reply.');
  if (!reply.ok) throw new Error(typeof reply.error === 'string' ? reply.error : 'Could not save preferences.');
  if (typeof reply.message !== 'string' || !reply.message || (reply.undoId !== null && typeof reply.undoId !== 'string')) {
    throw new Error('The settings writer returned an invalid acknowledgment.');
  }
  const preferences = decodePreferences(reply.preferences);
  if (reply.undoId !== null && preferences.ticket.undo?.id !== reply.undoId) throw new Error('The Undo acknowledgment does not match the saved change.');
  return { preferences, message: reply.message, undoId: reply.undoId };
}
export async function mutatePreferences(action: PreferenceAction): Promise<Preferences> {
  return (await commitPreferences(action)).preferences;
}

export interface ActivePage {
  tabId: number | null;
  context: AdoContext | null;
}

export async function activePage(): Promise<ActivePage> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return { tabId: tab?.id ?? null, context: parseAdoContext(tab?.url ?? '') };
}

async function requestInspection(tabId: number): Promise<Inspection> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply: unknown = await Promise.race([
      browser.tabs.sendMessage(tabId, { type: INSPECT_MESSAGE }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('The page inspector timed out. Reload the ADO tab and try again.')), 5000);
      }),
    ]);
    const result = decodeInspectionReply(reply);
    if (!result.ok) throw new Error(result.error);
    return result.inspection;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const connections = new Map<number, Promise<void>>();
export async function inspectActivePage(tabId: number): Promise<{ inspection: Inspection; connection: 'existing' | 'on-demand' }> {
  try {
    return { inspection: await requestInspection(tabId), connection: 'existing' };
  } catch (error) {
    const missingReader = error instanceof Error && /receiving end does not exist|could not establish connection/i.test(error.message);
    if (!missingReader && !(error instanceof ReaderVersionError)) throw error;
    const tab = await browser.tabs.get(tabId);
    if (!parseAdoContext(tab.url ?? '')) throw new Error('The active tab is no longer an ADO page. Return to ADO and refresh the count.');
    let pending = connections.get(tabId);
    if (!pending) {
      pending = (async () => {
        console.info('[ADO Customize] Connecting the page controller.');
        try {
          await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
        } catch (reason) {
          const detail = reason instanceof Error ? reason.message : 'The browser refused the content script.';
          throw new Error(`Could not connect the page controller. Allow ADO Customize to access this site, then retry. ${detail}`, { cause: reason });
        }
      })().finally(() => connections.delete(tabId));
      connections.set(tabId, pending);
    }
    await pending;
    return { inspection: await requestInspection(tabId), connection: 'on-demand' };
  }
}

export function extensionVersion(): string {
  return browser.runtime.getManifest().version;
}

export async function requestLayoutDiagnostics(command: LayoutCommand) {
  const page = await activePage();
  if (!page.context || page.tabId === null) throw new Error('Open an ADO Board or Ticket to capture its layout.');
  await inspectActivePage(page.tabId);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply: unknown = await Promise.race([
      browser.tabs.sendMessage(page.tabId, { type: LAYOUT_MESSAGE, command }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Layout diagnostics timed out.')), 10000); }),
    ]);
    return command === 'board' ? decodeBoardLayoutReply(reply) : decodeLayoutReply(reply);
  } finally { if (timeout) clearTimeout(timeout); }
}
