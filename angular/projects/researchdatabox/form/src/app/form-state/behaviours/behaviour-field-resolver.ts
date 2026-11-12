import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import { FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { getObjectWithJsonPointer } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../../form.component';

/**
 * Runtime dependencies for field resolution.
 *
 * The resolver intentionally depends on `FormComponent.getQuerySource()` rather
 * than walking component trees directly so all field path modes can share the
 * same JSON pointer source of truth.
 */
export interface BehaviourFieldResolverContext {
  formComponent: Pick<FormComponent, 'form' | 'getQuerySource'> & Partial<Pick<FormComponent, 'isActiveRelatedDisplayControl'>>;
}

export interface ResolvedField {
  control: AbstractControl;
  entry: FormFieldCompMapEntry;
}

/**
 * Resolve an `angularComponentsJsonPointer` to a writable control.
 *
 * Scope:
 * - supports behaviour `setValue` targets only
 * - returns both the current control and the stable `FormFieldCompMapEntry`
 *   so logical repeatable bindings can lock identity and re-resolve later
 *
 * Limitations:
 * - non-field targets are rejected
 * - callers are responsible for logging and fallback behaviour
 */
export function resolveFieldByPointer(
  fieldPath: string,
  ctx: BehaviourFieldResolverContext
): ResolvedField | undefined {
  const entry = resolveComponentByPointer(fieldPath, ctx);
  const control = entry?.model?.formControl as AbstractControl | undefined;
  return entry && control ? { entry, control } : undefined;
}

/** UI properties also apply to components without models, including workflow buttons. */
export function resolveComponentByPointer(
  fieldPath: string,
  ctx: BehaviourFieldResolverContext
): FormFieldCompMapEntry | undefined {
  const querySource = ctx.formComponent.getQuerySource();
  if (!querySource) {
    return undefined;
  }

  const result = getObjectWithJsonPointer(querySource.jsonPointerSource, fieldPath);
  const entry = result?.val?.metadata?.formFieldEntry as FormFieldCompMapEntry | undefined;
  return entry;
}

/**
 * Heuristic used by behaviour binding to enforce the v1 rule that `logical`
 * targets must point inside repeatables.
 */
export function isRepeatableFieldEntry(entry: FormFieldCompMapEntry | undefined): boolean {
  return !!entry?.lineagePaths?.formConfig?.includes('elementTemplate');
}

/** Preserve the bound control's identity across row moves, and reject removed rows. */
export function resolveFieldByIdentity(
  entry: FormFieldCompMapEntry | undefined,
  ctx: BehaviourFieldResolverContext
): ResolvedField | undefined {
  const control = entry?.model?.formControl;
  const form = ctx.formComponent.form;
  if (!entry || !control || !form) return undefined;
  const contains = (candidate: AbstractControl): boolean => {
    if (candidate === control) return true;
    if (candidate instanceof FormArray) return candidate.controls.some(contains);
    if (candidate instanceof FormGroup) return Object.values(candidate.controls).some(contains);
    return false;
  };
  return contains(form) ? { entry, control } : undefined;
}
