export interface TranslationLookup {
    t?: (key: string) => unknown;
}

export function resolveTranslation(key: string, locals?: Record<string, unknown>): string {
    const localTranslationService = locals?.TranslationService as TranslationLookup | undefined;

    try {
        if (localTranslationService && typeof localTranslationService.t === 'function') {
            return String(localTranslationService.t(key) ?? '').trim();
        }
    }
    catch (_error) {
        return '';
    }

    try {
        if (typeof TranslationService === 'undefined' || !TranslationService || typeof TranslationService.t !== 'function') {
            return '';
        }

        return String(TranslationService.t(key) ?? '').trim();
    }
    catch (_error) {
        return '';
    }
}

export function resolveSiteTitle(fallback: string, locals?: Record<string, unknown>): string {
    return resolveTranslation('default-title', locals) || fallback;
}
