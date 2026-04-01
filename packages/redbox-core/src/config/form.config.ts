/**
 * Form Config Interface
 * (sails.config.form)
 * 
 * Form configuration.
 * Note: This file contains require() calls for form-config files and must stay as JS.
 */

export interface FormConfig {
    /** Default form name */
    defaultForm: string;

    /** Form definitions by name */
    forms: {
        [formName: string]: unknown;
    };

    /** Shimmed registry for bootstrap and legacy consumers */
    formConfigRegistry?: {
        [formName: string]: unknown;
    };
}

// Note: The runtime config/form.js now delegates to api/form-config shims.
