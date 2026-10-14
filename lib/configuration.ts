import { MAX_CONFIGURATION_BYTES, portablePreferences, type Preferences } from './preferences';
import { isObject } from './ticket';

export const CONFIGURATION_BACKUP_KEY = 'ado-customize.configuration-backup.v1';
export interface Configuration {
  kind: 'ado-customize-configuration';
  version: 1;
  preferences: Preferences;
}
export interface ConfigurationBackup {
  kind: 'ado-customize-configuration-backup';
  version: 1;
  id: string;
  configuration: Configuration;
}
export function exportConfiguration(preferences: Preferences): Configuration {
  return { kind: 'ado-customize-configuration', version: 1, preferences: portablePreferences(preferences) };
}
export function decodeConfiguration(value: unknown): Configuration {
  if (!isObject(value) || value.kind !== 'ado-customize-configuration' || value.version !== 1) {
    throw new Error('This is not a supported ADOverride configuration file.');
  }
  return { kind: value.kind, version: 1, preferences: portablePreferences(value.preferences) };
}
export function parseConfiguration(text: string): Configuration {
  if (new TextEncoder().encode(text).byteLength > MAX_CONFIGURATION_BYTES) throw new Error('Configuration exceeds the 2 MB limit.');
  return decodeConfiguration(JSON.parse(text));
}
export function decodeConfigurationBackup(value: unknown): ConfigurationBackup {
  if (!isObject(value) || value.kind !== 'ado-customize-configuration-backup' || value.version !== 1 ||
    typeof value.id !== 'string' || !value.id.trim() || value.id.length > 128) throw new Error('Invalid configuration backup.');
  return { kind: value.kind, version: 1, id: value.id, configuration: decodeConfiguration(value.configuration) };
}
