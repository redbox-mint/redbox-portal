import { createHash } from 'crypto';
import { ShadowFingerprintInput } from './types';

/**
 * Hashes the bounded discrepancy tuple. JSON encoding keeps field boundaries
 * unambiguous so a route or brand identifier cannot forge another tuple's fingerprint.
 */
export function createShadowFingerprint(input: ShadowFingerprintInput): string {
  const payload = JSON.stringify([
    input.routeId,
    input.brandId ?? null,
    input.principalCategory,
    input.legacyAllowed,
    input.decision.allowed,
    input.decision.reasonCode,
  ]);

  return createHash('sha256').update(payload).digest('hex');
}
