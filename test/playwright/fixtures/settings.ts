import { isDeepStrictEqual } from 'node:util';
import type { APIRequestContext } from '@playwright/test';

export type CapturedSetting = { path: string; value: unknown; existed: boolean; kind: 'appconfig' | 'translation' };

type TranslationEntry = { value: unknown; category?: string; contentFormat?: string; description?: string };
function translationValue(value: unknown): TranslationEntry {
  const entry = value as TranslationEntry;
  return { value: entry.value, category: entry.category, contentFormat: entry.contentFormat, description: entry.description };
}

export async function captureSetting(request: APIRequestContext, path: string): Promise<CapturedSetting> {
  const kind = path.includes('/api/appconfig/') ? 'appconfig' : path.includes('/api/i18n/entries/') ? 'translation' : undefined;
  if (!kind) throw new Error(`No supported restoration contract for ${path}.`);
  const response = await request.get(path);
  if (kind === 'translation' && response.status() === 404) return { path, value: undefined, existed: false, kind };
  if (!response.ok()) throw new Error(`Cannot capture setting ${path} (${response.status()}).`);
  const value = await response.json();
  if (kind === 'translation') return { path, value: translationValue(value), existed: true, kind };
  const source = response.headers()['x-redbox-config-source'];
  if (source !== 'override' && source !== 'default') throw new Error(`Setting ${path} did not report its persisted/default source.`);
  return { path, value, existed: source === 'override', kind };
}

export async function restoreSetting(request: APIRequestContext, setting: CapturedSetting, csrfToken: string): Promise<void> {
  const headers = { 'X-CSRF-Token': csrfToken };
  const response = setting.existed
    ? await request.post(setting.path, { data: setting.value, headers })
    : await request.delete(setting.path, { headers });
  if (!response.ok() && !(setting.kind === 'translation' && !setting.existed && response.status() === 404)) {
    throw new Error(`Cannot restore setting ${setting.path} (${response.status()}).`);
  }
}

export async function verifySetting(request: APIRequestContext, setting: CapturedSetting): Promise<void> {
  const current = await captureSetting(request, setting.path);
  if (current.existed !== setting.existed || !isDeepStrictEqual(current.value, setting.value)) {
    throw new Error(`Setting ${setting.path} was not restored to its captured value and override presence.`);
  }
}
