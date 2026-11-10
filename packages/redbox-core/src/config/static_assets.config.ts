/**
 * Static Assets Config Interface and Default Values
 * Auto-generated from config/static_assets.js
 */

export interface StaticAssetsConfig {
    logoName: string;
    imageType: string;
    faviconName: string;
    faviconType: string;
}

export const static_assets: StaticAssetsConfig = {
    // Outlined vector artwork from RedBox_Logo_Text.eps; retain logo.png for existing URLs.
    logoName: 'logo.svg',
    imageType: 'image/svg+xml',
    faviconName: 'favicon-32x32.png',
    faviconType: 'image/png'
};
