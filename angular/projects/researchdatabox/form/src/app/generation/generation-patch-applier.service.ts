import { Injectable } from '@angular/core';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import {
  GenerationCandidatePatch,
  GenerationRuntimeInitialValue,
} from '@researchdatabox/sails-ng-common';
import { isEqual } from 'lodash-es';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import {
  createFieldValueChangedEvent,
  createGenerationPatchAppliedEvent,
} from '../form-state/events/form-component-event.types';

export interface GenerationPatchApplicationResult {
  changedFieldIds: string[];
  conflictFieldIds: string[];
}

function pointerParts(pointer: string): string[] {
  if (!pointer.startsWith('/')) return [];
  return pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function valueAt(value: unknown, pointer: string): unknown {
  let current = value;
  for (const part of pointerParts(pointer)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function withNestedValue(value: unknown, parts: string[], nextValue: unknown): Record<string, unknown> {
  const root = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {};
  let current = root;
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      current[part] = structuredClone(nextValue);
      break;
    }
    const child = current[part];
    const next = child !== null && typeof child === 'object' && !Array.isArray(child)
      ? child as Record<string, unknown>
      : {};
    current[part] = next;
    current = next;
  }
  return root;
}

interface InitialValueChange {
  control: AbstractControl;
  fieldId: string;
  previousValue: unknown;
  nextValue: unknown;
}

interface PatchTarget {
  control: AbstractControl;
  fieldId: string;
  expectedValue: unknown;
}

@Injectable({ providedIn: 'root' })
export class GenerationPatchApplierService {
  public applyInitialValues(
    values: GenerationRuntimeInitialValue[],
    form: FormGroup,
    eventBus: FormComponentEventBus,
    correlationId: string,
  ): void {
    for (const item of values) {
      const change = this.resolveInitialValueChange(form, item);
      if (!change || change.control.disabled || isEqual(change.previousValue, change.nextValue)) continue;
      change.control.setValue(structuredClone(change.nextValue), { emitEvent: false });
      change.control.markAsDirty({ onlySelf: true });
      change.control.markAsUntouched({ onlySelf: true });
      eventBus.publish(createFieldValueChangedEvent({
        fieldId: change.fieldId,
        value: structuredClone(change.nextValue),
        previousValue: structuredClone(change.previousValue),
        sourceId: change.fieldId,
        origin: 'system',
        correlationId,
      }));
    }
    form.updateValueAndValidity({ emitEvent: false });
  }

  public apply(
    candidate: GenerationCandidatePatch,
    form: FormGroup,
    executionSnapshot: Record<string, unknown>,
    eventBus: FormComponentEventBus,
  ): GenerationPatchApplicationResult {
    const changedFieldIds: string[] = [];
    const conflictFieldIds: string[] = [];
    const changes: Array<{ control: AbstractControl; fieldId: string; value: unknown; previousValue: unknown }> = [];

    for (const item of candidate.items) {
      const target = this.resolvePatchTarget(form, executionSnapshot, item.metadataPointer);
      if (!target || target.control.disabled || !isEqual(target.control.value, target.expectedValue)) {
        conflictFieldIds.push(item.fieldId);
        continue;
      }
      if (!isEqual(target.control.value, item.value)) {
        changes.push({
          control: target.control,
          fieldId: target.fieldId,
          value: structuredClone(item.value),
          previousValue: structuredClone(target.control.value),
        });
        changedFieldIds.push(item.fieldId);
      }
    }

    for (const change of changes) {
      change.control.setValue(change.value, { emitEvent: false });
      change.control.markAsDirty({ onlySelf: true });
      change.control.markAsUntouched({ onlySelf: true });
      change.control.updateValueAndValidity({ emitEvent: false, onlySelf: true });
    }
    form.updateValueAndValidity({ emitEvent: false });
    form.markAsDirty();

    for (const change of changes) {
      eventBus.publish(createFieldValueChangedEvent({
        fieldId: change.fieldId,
        value: change.value,
        previousValue: change.previousValue,
        sourceId: change.fieldId,
        origin: 'generation',
        correlationId: candidate.runId,
      }));
    }
    eventBus.publish(createGenerationPatchAppliedEvent({
      runId: candidate.runId,
      changedFieldIds,
      conflictFieldIds,
      sourceId: 'generation',
      origin: 'generation',
      correlationId: candidate.runId,
    }));
    return { changedFieldIds, conflictFieldIds };
  }

  private resolvePatchTarget(
    form: FormGroup,
    executionSnapshot: Record<string, unknown>,
    pointer: string,
  ): PatchTarget | null {
    const parts = pointerParts(pointer);
    if (!parts.length) return null;
    const exactControl = form.get(parts);
    if (exactControl) {
      return {
        control: exactControl,
        fieldId: parts.at(-1) ?? pointer,
        expectedValue: valueAt(executionSnapshot, pointer),
      };
    }
    const fieldId = parts.at(-1);
    if (!fieldId) return null;
    const flatControl = form.get(fieldId);
    return flatControl ? {
      control: flatControl,
      fieldId,
      expectedValue: valueAt(executionSnapshot, `/${fieldId.replaceAll('~', '~0').replaceAll('/', '~1')}`),
    } : null;
  }

  private resolveInitialValueChange(
    form: FormGroup,
    item: GenerationRuntimeInitialValue,
  ): InitialValueChange | null {
    const parts = pointerParts(item.metadataPointer);
    if (!parts.length) return null;

    const exactControl = form.get(parts);
    if (exactControl) {
      return {
        control: exactControl,
        fieldId: parts.at(-1) ?? item.metadataPointer,
        previousValue: exactControl.value,
        nextValue: item.value,
      };
    }

    for (let prefixLength = parts.length - 1; prefixLength > 0; prefixLength -= 1) {
      const control = form.get(parts.slice(0, prefixLength));
      if (!(control instanceof FormControl)) continue;
      const remainder = parts.slice(prefixLength);
      const existingNestedValue = valueAt(control.value, `/${remainder.join('/')}`);
      if (isEqual(existingNestedValue, item.value)) return null;
      return {
        control,
        fieldId: parts[prefixLength - 1],
        previousValue: control.value,
        nextValue: withNestedValue(control.value, remainder, item.value),
      };
    }
    return null;
  }

  private fieldId(pointer: string): string {
    return pointerParts(pointer).at(-1) ?? pointer;
  }
}
