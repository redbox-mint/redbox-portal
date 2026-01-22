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
}

// Note: Default values require runtime require() calls to form-config files.
// The original config/form.js file must be kept for runtime.
