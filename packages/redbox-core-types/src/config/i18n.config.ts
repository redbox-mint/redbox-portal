/**
 * i18n Config Interface and Default Values
 * Auto-generated from config/i18n.js
 */

export interface I18nDetectionConfig {
    order?: string[];
    lookupCookie?: string;
    caches?: string[];
    cookieMinutes?: number;
    cookieDomain?: string;
    lookupSession?: string;
    lookupQuerystring?: string;
}

export interface I18nNextInitConfig {
    supportedLngs: string[];
    preload: string[];
    debug: boolean;
    fallbackLng: string;
    lowerCaseLng: boolean;
    initImmediate: boolean;
    skipOnVariables: boolean;
    returnEmptyString: boolean;
    ns: string[];
    detection: I18nDetectionConfig;
}

export interface I18nNextConfig {
    init: I18nNextInitConfig;
}

export interface I18nConfig {
    locales?: string[];
    defaultLocale?: string;
    updateFiles?: boolean;
    localesDirectory?: string;
    next: I18nNextConfig;
}

export const i18n: I18nConfig = {
    next: {
        init: {
            supportedLngs: ['en'],
            preload: ['en'],
            debug: true,
            fallbackLng: 'en',
            lowerCaseLng: true,
            initImmediate: false,
            skipOnVariables: false,
            returnEmptyString: false,
            ns: ['translation'],
            detection: {
                order: ['cookie'],
                lookupCookie: 'lng',
                caches: ['cookie'],
                cookieMinutes: 10080,
                lookupSession: 'lang',
            }
        }
    }
};
