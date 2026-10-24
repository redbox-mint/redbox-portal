/**
 * Workspace Type Config Interface
 * (configuration.workspacetype)
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

/**
 * Default workspace types are no longer shipped in core.
 *
 * The demo "existing-locations" workspace type now lives in the redbox-hook-dev
 * package and is merged into configuration.workspacetype by extension composition when that
 * hook is installed. Core ships pristine.
 */
export const workspacetype: WorkspaceTypeConfig = {};
