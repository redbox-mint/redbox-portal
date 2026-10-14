import { Injectable, inject } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { isEqual } from 'lodash-es';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentsMap, FormService } from './form.service';
import { setControlValue } from './form-state/custom-set-value.control';

export type ServerSyncMode = 'always' | 'preserveLocalEdits' | 'never';
export type ServerSyncSkipReason =
  | 'not-in-server'
  | 'no-control'
  | 'excluded'
  | 'unchanged'
  | 'local-edit'
  | 'local-edit-during-sync'
  | 'set-failed';

export interface ServerSyncResult {
  patched: string[];
  skipped: Array<{ name: string; reason: ServerSyncSkipReason }>;
}

@Injectable({ providedIn: 'root' })
export class FormServerSyncService {
  private readonly formService = inject(FormService);
  private readonly logger = inject(LoggerService);

  public async applyServerMetadata(
    sentValue: Record<string, unknown>,
    serverValue: Record<string, unknown>,
    formDefMap: FormComponentsMap,
    form: FormGroup,
    mode: ServerSyncMode
  ): Promise<ServerSyncResult> {
    return this.syncServerMetadata(sentValue, serverValue, formDefMap, form, mode, false);
  }

  /** Replace every projected form control after an explicit discard/adopt decision. */
  public async replaceWithServerMetadata(
    serverValue: Record<string, unknown>,
    formDefMap: FormComponentsMap,
    form: FormGroup
  ): Promise<ServerSyncResult> {
    return this.syncServerMetadata({}, serverValue, formDefMap, form, 'always', true);
  }

  private async syncServerMetadata(
    sentValue: Record<string, unknown>,
    serverValue: Record<string, unknown>,
    formDefMap: FormComponentsMap,
    form: FormGroup,
    mode: ServerSyncMode,
    replaceMissing: boolean
  ): Promise<ServerSyncResult> {
    const result: ServerSyncResult = { patched: [], skipped: [] };
    if (mode === 'never') {
      return result;
    }

    const completeGroupMap = formDefMap.completeGroupMap ?? {};
    const controls = formDefMap.withFormControl ?? {};
    const names = new Set([
      ...Object.keys(sentValue),
      ...Object.keys(serverValue),
      ...(replaceMissing ? Object.keys(controls) : []),
    ]);

    for (const name of names) {
      if (!(name in serverValue) && !replaceMissing) {
        result.skipped.push({ name, reason: 'not-in-server' });
        continue;
      }
      const control = controls[name] as AbstractControl<unknown> | undefined;
      if (!control) {
        result.skipped.push({ name, reason: 'no-control' });
        continue;
      }

      const component = completeGroupMap[name];
      if (component && !this.formService.shouldIncludeInFormControlMap(component)) {
        result.skipped.push({ name, reason: 'excluded' });
        continue;
      }

      const sent = sentValue[name];
      const server = name in serverValue ? serverValue[name] : undefined;
      if (isEqual(sent, server) && (!replaceMissing || name in serverValue)) {
        result.skipped.push({ name, reason: 'unchanged' });
        continue;
      }

      if (mode === 'preserveLocalEdits' && control.dirty) {
        result.skipped.push({ name, reason: 'local-edit' });
        continue;
      }

      let concurrentEditVersion = 0;
      let concurrentEditValue: unknown;
      const concurrentEditSubscription = control.valueChanges.subscribe(value => {
        concurrentEditVersion += 1;
        concurrentEditValue = structuredClone(value);
      });
      try {
        await setControlValue(control, server, { emitEvent: false });
        if (concurrentEditVersion > 0) {
          // A custom control may await while replacing its value. If the user
          // edits that same control during the await, the late server write
          // must not win. Keep restoring the newest emitted edit until one
          // replacement completes without a newer user value arriving.
          let restoredVersion = 0;
          while (restoredVersion !== concurrentEditVersion) {
            const versionToRestore = concurrentEditVersion;
            const valueToRestore = structuredClone(concurrentEditValue);
            await setControlValue(control, valueToRestore, { emitEvent: false });
            restoredVersion = versionToRestore;
          }
          control.markAsDirty();
          result.skipped.push({ name, reason: 'local-edit-during-sync' });
          continue;
        }
        // Only a control whose value was accepted from the server is clean.
        // A control skipped above may have been edited while the request was
        // in flight and must remain dirty for a subsequent save/navigation
        // guard to detect it.
        control.markAsPristine();
        result.patched.push(name);
      } catch (error) {
        control.markAsDirty();
        result.skipped.push({ name, reason: 'set-failed' });
        this.logger.warn(`Failed to sync server value for form control '${name}'.`, error);
      } finally {
        concurrentEditSubscription?.unsubscribe();
      }
    }

    form.updateValueAndValidity({ emitEvent: false });
    return result;
  }
}
