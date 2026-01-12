/**
 * Policies Config Interface
 * (sails.config.policies)
 * 
 * Map policies to controller actions.
 * Note: This file contains JavaScript arrays and must stay as JS for runtime.
 */

export type PolicyName = string | boolean;
export type PolicyList = PolicyName[];

export interface ControllerPolicies {
    /** Default policy for all actions in controller */
    '*'?: PolicyList | PolicyName;

    /** Per-action policy overrides */
    [actionName: string]: PolicyList | PolicyName | undefined;
}

export interface PoliciesConfig {
    /** Default policy for all controllers/actions */
    '*'?: PolicyList | PolicyName;

    /** Per-controller policy configuration */
    [controllerName: string]: ControllerPolicies | PolicyList | PolicyName | undefined;
}

// Note: Default values contain JavaScript arrays and variable references.
// The original config/policies.js file must be kept for runtime.
