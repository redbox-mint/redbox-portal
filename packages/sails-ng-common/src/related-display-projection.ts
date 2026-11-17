import { formatJsonPointer, parseJsonPointer } from '@jsonjoy.com/json-pointer';
import { normalizeRelatedReferenceValues, readRelatedReference as at } from './related-reference-values';
import type { RelatedFormDescriptors } from './related-records.model';

/** Decode server-derived display pointers to literal form path tokens. */
export function relatedDisplayPointerTokens(pointer: string): string[] {
  return parseJsonPointer(pointer).map(String);
}

/** Matches server reference activation, including malformed nonempty references. */
export function relatedDisplayActive(metadata: unknown, contract: RelatedFormDescriptors, relationId: string): boolean {
  const relation = contract.relations.find(item => item.relationId === relationId);
  if (!relation) return true; // Invalid contracts must never expose a writable display target.
  const raw = at(metadata, relation.referenceTokens);
  const references = normalizeRelatedReferenceValues(raw,
    relation.oidTokens ? value => at(value, relation.oidTokens!) : undefined);
  return references.values.length > 0 || references.invalidIndices.length > 0;
}

/** Detached local submission/comparison view. Legacy forms take the identity path.
 * Targets are complete values (including groups/repeatables), never wildcard rows.
 */
export function projectRelatedDisplayMetadata<T extends Record<string, unknown>>(
  metadata: T, contract?: RelatedFormDescriptors, referenceMetadata: Record<string, unknown> = metadata
): T {
  if (!contract?.displayTargets.length) return metadata;
  const active = contract.displayTargets.filter(target => {
    if (relatedDisplayActive(referenceMetadata, contract, target.relationId)) return true;
    const tokens = relatedDisplayPointerTokens(target.metadataPointer);
    const parent = at(metadata, tokens.slice(0, -1));
    return parent !== null && typeof parent === 'object' &&
      Object.prototype.hasOwnProperty.call(parent, tokens[tokens.length - 1]) && at(metadata, tokens) === undefined;
  });
  // An omitted server reference is represented by an undefined Angular reset,
  // not by JSON null. Keep comparison snapshots aligned with its wire absence.
  for (const relation of contract.relations) {
    const parent = at(metadata, relation.referenceTokens.slice(0, -1));
    const key = relation.referenceTokens[relation.referenceTokens.length - 1];
    if (parent !== null && typeof parent === 'object' && Object.prototype.hasOwnProperty.call(parent, key) &&
      at(metadata, relation.referenceTokens) === undefined) {
      active.push({ relationId: relation.relationId,
        metadataPointer: formatJsonPointer(relation.referenceTokens) });
    }
  }
  if (!active.length) return metadata;
  const result = structuredClone(metadata);
  for (const target of active) {
    const tokens = relatedDisplayPointerTokens(target.metadataPointer);
    const parent = at(result, tokens.slice(0, -1));
    if (parent !== null && typeof parent === 'object') delete (parent as Record<string, unknown>)[tokens[tokens.length - 1]];
    // Canonicalize containers holding only transient children. Otherwise a source
    // population can create an empty group which appears as a local insertion.
    for (let depth = tokens.length - 1; depth > 0; depth -= 1) {
      const child = at(result, tokens.slice(0, depth));
      if (child === null || typeof child !== 'object' || Array.isArray(child) || Object.keys(child).length) break;
      const ancestor = at(result, tokens.slice(0, depth - 1));
      if (ancestor !== null && typeof ancestor === 'object') delete (ancestor as Record<string, unknown>)[tokens[depth - 1]];
    }
  }
  return result;
}

/** A reference change can change persistence semantics: require explicit review. */
export function relatedDisplayReferencesEqual(
  left: Record<string, unknown>, right: Record<string, unknown>, contract?: RelatedFormDescriptors
): boolean {
  if (!contract?.displayTargets.length) return true;
  return contract.relations.every(relation =>
    JSON.stringify(at(left, relation.referenceTokens)) === JSON.stringify(at(right, relation.referenceTokens)));
}

/** Keep expression-owned display values when synchronizing a server/local candidate.
 * This view is exclusively for controls; never send it to persistence or comparison.
 */
export function retainRelatedDisplayValues(
  candidate: Record<string, unknown>, displayed: Record<string, unknown>, contract?: RelatedFormDescriptors
): Record<string, unknown> {
  if (!contract?.displayTargets.length) return candidate;
  const result = structuredClone(candidate);
  for (const target of contract.displayTargets) {
    const relation = contract.relations.find(item => item.relationId === target.relationId);
    const sameReference = !!relation && JSON.stringify(at(candidate, relation.referenceTokens)) === JSON.stringify(at(displayed, relation.referenceTokens));
    const retain = sameReference && relatedDisplayActive(candidate, contract, target.relationId);
    if (sameReference && !retain) continue;
    // A changed reference must replace/clear the old control even when the
    // server omitted the target. Explicit undefined is a control reset marker;
    // JSON serialization omits it, while explicit null remains null.
    const source = retain ? displayed : candidate;
    const tokens = relatedDisplayPointerTokens(target.metadataPointer);
    let parent = result;
    for (const [index, token] of tokens.slice(0, -1).entries()) {
      if (!Object.prototype.hasOwnProperty.call(parent, token) || parent[token] === null || typeof parent[token] !== 'object') {
        // For an omitted group, force only its declared target to reset; keep
        // local siblings which normal omission-based sync would leave alone.
        const previous = !Object.prototype.hasOwnProperty.call(parent, token) ? at(displayed, tokens.slice(0, index + 1)) : undefined;
        const value = previous !== null && typeof previous === 'object' && !Array.isArray(previous) ? structuredClone(previous) : {};
        Object.defineProperty(parent, token, { value, writable: true, enumerable: true, configurable: true });
      }
      parent = parent[token] as Record<string, unknown>;
    }
    Object.defineProperty(parent, tokens[tokens.length - 1], { value: structuredClone(at(source, tokens)), writable: true, enumerable: true, configurable: true });
  }
  return result;
}
