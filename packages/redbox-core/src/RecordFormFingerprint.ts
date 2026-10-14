import { createHash } from 'node:crypto';
import { isRecordFormFingerprint, type RecordFormFingerprint } from '@researchdatabox/sails-ng-common';

const RECORD_FORM_FINGERPRINT_MAX_BYTES = 1_048_576;
const RECORD_FORM_FINGERPRINT_MAX_NODES = 50_000;

/**
 * Build a stable, bounded fingerprint for an authoritative form contract.
 * Accessors are never invoked and the serialized contract is never retained.
 */
export function formatRecordFormFingerprint(value: unknown): RecordFormFingerprint | undefined {
  const hash = createHash('sha256');
  const seen = new WeakSet<object>();
  let bytes = 0;
  let nodes = 0;
  let bounded = true;

  const append = (part: string): void => {
    if (!bounded) return;
    const size = Buffer.byteLength(part);
    if (bytes + size > RECORD_FORM_FINGERPRINT_MAX_BYTES) {
      bounded = false;
      return;
    }
    bytes += size;
    hash.update(part);
  };

  const walk = (item: unknown): void => {
    nodes += 1;
    if (nodes > RECORD_FORM_FINGERPRINT_MAX_NODES) {
      bounded = false;
      return;
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'string') {
      append(JSON.stringify(item));
      return;
    }
    if (typeof item === 'number') {
      append(Number.isFinite(item) ? JSON.stringify(item) : JSON.stringify(String(item)));
      return;
    }
    if (typeof item === 'undefined') {
      append('"[undefined]"');
      return;
    }
    if (typeof item === 'function') {
      append(JSON.stringify(`[function:${Function.prototype.toString.call(item)}]`));
      return;
    }
    if (typeof item !== 'object') {
      append(JSON.stringify(String(item)));
      return;
    }
    if (seen.has(item)) {
      append('"[circular]"');
      return;
    }

    seen.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Array.isArray(item)) {
        append('[');
        for (let index = 0; index < item.length && bounded; index += 1) {
          if (index > 0) append(',');
          const descriptor = descriptors[String(index)];
          if (descriptor && 'value' in descriptor) walk(descriptor.value);
          else append('"[accessor-or-hole]"');
        }
        append(']');
        return;
      }

      append('{');
      let first = true;
      for (const key of Object.keys(descriptors).sort()) {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable) continue;
        if (!first) append(',');
        first = false;
        append(JSON.stringify(key));
        append(':');
        if ('value' in descriptor) walk(descriptor.value);
        else append('"[accessor]"');
        if (!bounded) break;
      }
      append('}');
    } finally {
      seen.delete(item);
    }
  };

  walk(value);
  if (!bounded) return undefined;
  const fingerprint = `sha256:${hash.digest('hex')}`;
  return isRecordFormFingerprint(fingerprint) ? fingerprint : undefined;
}
