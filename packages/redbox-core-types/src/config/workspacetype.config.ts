/**
 * Workspace Type Config Interface
 * (sails.config.workspacetype)
 * 
 * Workspace type definitions.
 */

export interface WorkspaceTypeDefinition {
    /** Record type name for the workspace */
    name: string;

    /** Label translation key */
    label: string;

    /** Subtitle translation key */
    subtitle: string;

    /** Description translation key */
    description: string;

    /** Logo image path */
    logo: string;
}

export interface WorkspaceTypeConfig {
    [workspaceTypeName: string]: WorkspaceTypeDefinition;
}

export const workspacetype: WorkspaceTypeConfig = {
    'existing-locations': {
        name: 'existing-locations',
        label: '@existing-locations-label',
        subtitle: '@existing-locations-label',
        description: '@existing-locations-description',
        logo: '/images/blank.png'
    }
};
