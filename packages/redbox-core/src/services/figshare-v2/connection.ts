import type { FigshareConnectionConfig } from '../../configmodels/FigsharePublishing';

/** Shared by publishing and the admin read-only probe; Axios uses system TLS trust. */
export function figshareConnectionOptions(connection: FigshareConnectionConfig) {
  return {
    timeout: connection.timeoutMs,
    headers: { 'Content-Type': 'application/json', Authorization: `token ${connection.token}` },
  };
}
