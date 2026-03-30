/**
 * Dynamic Asset Config Interface and Default Values
 * Auto-generated from config/dynamicasset.js
 */

export interface DynamicAssetDefinition {
    view: string;
    type: string;
}

export interface DynamicAssetConfig {
    [assetName: string]: DynamicAssetDefinition;
}

export const dynamicasset: DynamicAssetConfig = {
    apiClientConfig: {
        view: "apiClientConfig",
        type: "application/json"
    },
    dynamicScriptAsset: {
        view: "dynamicScriptAsset",
        type: "text/javascript",
    },
};
