import { createHash } from 'node:crypto';
import { isRecordFormFingerprint, type RecordFormFingerprint } from '@researchdatabox/sails-ng-common';

const RECORD_FORM_FINGERPRINT_MAX_BYTES = 1_048_576;
const RECORD_FORM_FINGERPRINT_MAX_NODES = 50_000;

/**
 * Build a stable, bounded fingerprint for an authoritative form contract.
 * Accessors are never invoked and the serialized contract is never retained.
 */
export function formatRecordFormFingerprint(value: unknown): RecordFormFingerprint | undefined {
  return fingerprint(value).value;
}

function fingerprint(value: unknown): { value?: RecordFormFingerprint; bytes: number; nodes: number } {
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
  if (!bounded) return { bytes, nodes };
  const fingerprint = `sha256:${hash.digest('hex')}`;
  return { value: isRecordFormFingerprint(fingerprint) ? fingerprint : undefined, bytes, nodes };
}

/** Compose individually bounded form contracts without treating a catalogue as one form.
 * Even for scoped discovery, hash the full reusable-definition snapshot. Overrides
 * and hook contributors can introduce reusable references during compilation, so
 * the pre-compilation fingerprint has no complete dependency list to narrow.
 */
export function formatRecordFormCatalogueFingerprint(
  candidates: readonly unknown[],
  reusableFormDefinitions: unknown
): RecordFormFingerprint | undefined {
  if (candidates.length > 100) return undefined;
  const reusable = formatRecordFormFingerprint(reusableFormDefinitions);
  if (!reusable) return undefined;
  const forms = candidates.map(candidate => formatRecordFormFingerprint(candidate));
  if (forms.some(fingerprint => !fingerprint)) return undefined;
  return formatRecordFormFingerprint({ forms, reusable });
}

/** Partition a grid snapshot into bounded fields/contracts before hashing its summary.
 * Retains each 1 MiB/50k-node part bound and an aggregate 8 MiB/250k-node budget.
 * Unlike a form, a catalogue may contain 1,000 fields across 100 read variants.
 */
export function formatRecordGridFingerprint(parts: readonly unknown[]): RecordFormFingerprint | undefined {
  if (parts.length > 1104) return undefined;
  let bytes = 0;
  let nodes = 0;
  const hashes: RecordFormFingerprint[] = [];
  for (const part of parts) {
    const result = fingerprint(part);
    bytes += result.bytes;
    nodes += result.nodes;
    if (!result.value || bytes > 8_388_608 || nodes > 250_000) return undefined;
    hashes.push(result.value);
  }
  return formatRecordFormFingerprint(hashes);
}
