/**
 * API Config Interface and Default Values
 * Auto-generated from config/api.js
 */

export interface ReDBoxAPIConfig {
  /** Additional public browser settings merged into apiClientConfig. */
  additionalClientConfig?: Record<string, unknown>;
    max_requests: number;
}

export const api: ReDBoxAPIConfig = {
    max_requests: 20
};
