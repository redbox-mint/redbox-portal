import { relatedDisplayPointerTokens } from '@researchdatabox/sails-ng-common';
import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import { RelatedFormDescriptors } from '@researchdatabox/sails-ng-common';
import { get, unset } from 'lodash-es';

// Presence belongs to this form's controls, never to stored metadata or a
// durable archive. Native group setters require concrete child empty values.
const serverAbsent = new WeakSet<AbstractControl>();
export function relatedDisplayEmptyValue(control: AbstractControl): unknown {
  if (control instanceof FormArray) return [];
  if (control instanceof FormGroup) return Object.fromEntries(
    Object.entries(control.controls).map(([name, child]) => [name, relatedDisplayEmptyValue(child)]));
  return null;
}

export function setRelatedDisplayAbsent(control: AbstractControl, absent: boolean): void {
  if (absent) serverAbsent.add(control);
  else serverAbsent.delete(control);
}

/** Omit untouched server-absent targets; an explicit dirty edit (even null)
 * restores ordinary local presence. Raw control values remain expression data. */
export function omitAbsentRelatedDisplayValues(
  value: Record<string, unknown>, form: FormGroup, contract: RelatedFormDescriptors
): Record<string, unknown> {
  for (const target of contract.displayTargets) {
    const path = relatedDisplayPointerTokens(target.metadataPointer);
    const control = form.get(path);
    if (!control || !serverAbsent.has(control)) continue;
    if (control.dirty) { serverAbsent.delete(control); continue; }
    unset(value, path);
    for (let depth = path.length - 1; depth > 0; depth -= 1) {
      const child = get(value, path.slice(0, depth));
      if (!child || typeof child !== 'object' || Array.isArray(child) || Object.keys(child).length) break;
      unset(value, path.slice(0, depth));
    }
  }
  return value;
}
