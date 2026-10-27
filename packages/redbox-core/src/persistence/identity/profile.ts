import { isDeepStrictEqual } from 'node:util';
import type { Values } from './IdentityRepositories';
import { identityFields } from './fields';

/** Only submitted profile changes; never round-trip nulls materialized by model reads. */
export function identityProfilePatch(profile: Values, original?: Values): Values {
  return Object.fromEntries(
    Object.keys(identityFields.user)
      .filter(
        key =>
          profile[key] !== undefined &&
          (original ? !isDeepStrictEqual(profile[key], original[key]) : profile[key] !== null)
      )
      .map(key => [key, profile[key]])
  );
}
