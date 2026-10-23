import {
  makeHttpLayer as ownedHttpLayer,
  invalidateToken as ownedInvalidate,
  type RaidTokenEntry,
} from '../../integrations/raid/http';
// Temporary comparison cache only. Standalone providers own their own map.
const tokens = new Map<string, RaidTokenEntry>();
export const makeHttpLayer = () => ownedHttpLayer(tokens);
export const invalidateToken = (key: string): void => ownedInvalidate(tokens, key);
