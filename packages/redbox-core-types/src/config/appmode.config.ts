/**
 * App Mode Config Interface and Default Values
 * Auto-generated from config/appmode.js
 */

export interface AppModeConfig {
    bootstrapAlways: boolean;
    hidePlaceholderPages: boolean;
    features?: Record<string, unknown>;
    flags?: Record<string, unknown>;
}

export const appmode: AppModeConfig = {
    bootstrapAlways: true,
    hidePlaceholderPages: true
};
