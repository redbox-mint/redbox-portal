import { get } from 'lodash';
import { normalizeRelatedReferenceValues } from '@researchdatabox/sails-ng-common';

/** Opt-in references retain Lodash's trusted string/path extraction semantics. */
export function normalizeRelatedReferences(raw: unknown, oidProperty?: string | readonly string[]) {
  return normalizeRelatedReferenceValues(raw, oidProperty ? value => get(value, oidProperty) : undefined);
}
