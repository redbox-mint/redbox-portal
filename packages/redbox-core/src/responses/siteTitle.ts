declare const TranslationService: {
    t: (key: string) => string;
};

export function resolveSiteTitle(fallback: string): string {
    try {
        if (typeof TranslationService === 'undefined' || !TranslationService || typeof TranslationService.t !== 'function') {
            return fallback;
        }

        const translatedTitle = TranslationService.t('default-title');
        const trimmedTitle = typeof translatedTitle === 'string' ? translatedTitle.trim() : '';

        return trimmedTitle || fallback;
    }
    catch (_error) {
        return fallback;
    }
}