/**
 * TypeScript Hook Config Interface
 * (sails.config.typescript)
 * 
 * TypeScript compilation hook configuration.
 */

export interface TypeScriptHookConfig {
    /** Enable/disable TypeScript compilation hook */
    active: boolean;
}

export const typescript: TypeScriptHookConfig = {
    active: false
};
