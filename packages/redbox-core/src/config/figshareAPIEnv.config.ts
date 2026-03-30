/**
 * Figshare API Env Config Interface
 * (sails.config.figshareAPIEnv)
 * 
 * Figshare API environment overrides.
 */

export interface FigshareApiEnvConfig {
    overrideArtifacts: Record<string, unknown>;
}

export const figshareAPIEnv: FigshareApiEnvConfig = {
    overrideArtifacts: {}
};
