import type { RaidPublishingConfigData } from '../../configmodels/RaidPublishing';

type Connection = RaidPublishingConfigData['connection'];
export function raidConnectionOptions(connection: Connection, token: string) {
  return { timeout: connection.timeoutMs + 5000, headers: { Authorization: `Bearer ${token}` } };
}
export function raidOAuthRequest(oauth: Connection['oauth']) {
  return {
    url: oauth.url,
    data: new URLSearchParams({ grant_type: 'password', client_id: oauth.clientId, username: oauth.username, password: oauth.password }),
    timeout: oauth.timeoutMs + 5000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  };
}
