import { normalizeRelatedReferenceValues, readRelatedReference } from '@researchdatabox/sails-ng-common';
export { readRelatedReference } from '@researchdatabox/sails-ng-common';

/** Request identities remain useful even when the underlying promise cannot be aborted. */
export class RelatedRecordRequests {
  private sequence = 0;
  private disposed = false;

  nextSequence(): number {
    return ++this.sequence;
  }

  guard(matches: () => boolean): () => boolean {
    return () => !this.disposed && matches();
  }

  candidate(): { sequence: number; isCurrent: () => boolean } {
    const sequence = this.nextSequence();
    return { sequence, isCurrent: () => !this.disposed && sequence === this.sequence };
  }

  dispose(): void {
    this.disposed = true;
    ++this.sequence;
  }
}

/** Must match the server's normalized fingerprint, using own-property browser tokens. */
export function relatedReferenceIdentity(raw: unknown, oidTokens?: readonly string[]) {
  return normalizeRelatedReferenceValues(raw, oidTokens ? value => readRelatedReference(value, oidTokens) : undefined);
}
