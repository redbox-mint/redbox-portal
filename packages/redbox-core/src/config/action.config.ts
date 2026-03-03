/**
 * Action Config Interface and Default Values
 * Auto-generated from config/action.js
 */

export interface ActionDefinition {
    service: string;
    method: string;
}

export interface ActionConfig {
    [actionName: string]: ActionDefinition;
}

export const action: ActionConfig = {};
