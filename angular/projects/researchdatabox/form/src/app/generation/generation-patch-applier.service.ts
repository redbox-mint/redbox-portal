import { Injectable } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
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

@Injectable({ providedIn: 'root' })
export class GenerationPatchApplierService {
  public applyInitialValues(
    values: GenerationRuntimeInitialValue[],
    form: FormGroup,
    eventBus: FormComponentEventBus,
    correlationId: string,
  ): void {
    for (const item of values) {
      const control = this.controlFor(form, item.metadataPointer);
      if (!control || control.disabled || isEqual(control.value, item.value)) continue;
      const previousValue = structuredClone(control.value);
      control.setValue(structuredClone(item.value), { emitEvent: false });
      control.markAsDirty({ onlySelf: true });
      control.markAsUntouched({ onlySelf: true });
      eventBus.publish(createFieldValueChangedEvent({
        fieldId: this.fieldId(item.metadataPointer),
        value: structuredClone(item.value),
        previousValue,
        sourceId: this.fieldId(item.metadataPointer),
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
      const control = this.controlFor(form, item.metadataPointer);
      const expectedValue = valueAt(executionSnapshot, item.metadataPointer);
      if (!control || control.disabled || !isEqual(control.value, expectedValue)) {
        conflictFieldIds.push(item.fieldId);
        continue;
      }
      if (!isEqual(control.value, item.value)) {
        changes.push({
          control,
          fieldId: this.fieldId(item.metadataPointer),
          value: structuredClone(item.value),
          previousValue: structuredClone(control.value),
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

  private controlFor(form: FormGroup, pointer: string): AbstractControl | null {
    const parts = pointerParts(pointer);
    return parts.length > 0 ? form.get(parts) : null;
  }

  private fieldId(pointer: string): string {
    return pointerParts(pointer).at(-1) ?? pointer;
  }
}
