/** HttpLanguage authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface HttpLanguage {
  readonly code: string;
  readonly displayName: string;
  readonly enabled?: boolean;
}
/** LanguageInput authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface LanguageInput {
  readonly query?: unknown;
  readonly session?: unknown;
  readonly config?: { readonly supportedLngs?: unknown; readonly fallbackLng?: unknown; readonly lng?: unknown };
  languages(): Promise<readonly HttpLanguage[]>;
  warn?(): unknown | Promise<unknown>;
}

/** Shared page/action resolver; callers explicitly persist the selected language
 * at their existing session boundary. No brand or session is invented here.
 * @extensionPoint Supply the selected language source and persist the result through the application session owner.
 */
export async function resolveLanguage(
  input: LanguageInput
): Promise<{ readonly language: string; readonly languages: readonly HttpLanguage[] }> {
  const config = input.config;
  let languages: HttpLanguage[];
  try {
    const loaded = await input.languages();
    const configured = Array.isArray(config?.supportedLngs)
      ? config.supportedLngs.filter((code): code is string => typeof code === 'string' && code !== 'cimode')
      : ['en'];
    const options: readonly HttpLanguage[] = loaded.length
      ? loaded
      : configured.map(code => ({ code, displayName: code === 'en' ? 'English' : code }));
    languages = options
      .filter(language => language.code !== 'cimode' && language.enabled !== false)
      .map(language => Object.freeze({ code: language.code, displayName: language.displayName || language.code }));
  } catch {
    try {
      await input.warn?.();
    } catch {
      /* observation only */
    }
    languages = [{ code: 'en', displayName: 'English' }];
  }
  const fallbacks =
    typeof config?.fallbackLng === 'string'
      ? [config.fallbackLng]
      : Array.isArray(config?.fallbackLng)
        ? config.fallbackLng
        : [];
  const language =
    [input.query, input.session, config?.lng, ...fallbacks, 'en', languages[0]?.code].find(
      (value): value is string => typeof value === 'string' && languages.some(language => language.code === value)
    ) || 'en';
  return Object.freeze({ language, languages: Object.freeze(languages) });
}
