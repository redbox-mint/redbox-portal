import { Injectable, inject } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { isEqual } from 'lodash-es';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentsMap, FormService } from './form.service';
import { setControlValue } from './form-state/custom-set-value.control';

export type ServerSyncMode = 'always' | 'preserveLocalEdits' | 'never';

export interface ServerSyncResult {
  patched: string[];
  skipped: Array<{ name: string; reason: string }>;
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
    const result: ServerSyncResult = { patched: [], skipped: [] };
    if (mode === 'never') {
      return result;
    }

    const completeGroupMap = formDefMap.completeGroupMap ?? {};
    const controls = formDefMap.withFormControl ?? {};
    const names = new Set([...Object.keys(sentValue), ...Object.keys(serverValue)]);

    for (const name of names) {
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
      const server = serverValue[name];
      if (isEqual(sent, server)) {
        result.skipped.push({ name, reason: 'unchanged' });
        continue;
      }

      if (mode === 'preserveLocalEdits' && control.dirty) {
        result.skipped.push({ name, reason: 'local-edit' });
        continue;
      }

      try {
        await setControlValue(control, server, { emitEvent: false });
        // Only a control whose value was accepted from the server is clean.
        // A control skipped above may have been edited while the request was
        // in flight and must remain dirty for a subsequent save/navigation
        // guard to detect it.
        control.markAsPristine();
        result.patched.push(name);
      } catch (error) {
        result.skipped.push({ name, reason: 'set-failed' });
        this.logger.warn(`Failed to sync server value for form control '${name}'.`, error);
      }
    }

    form.updateValueAndValidity({ emitEvent: false });
    return result;
  }
}
