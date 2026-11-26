import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import type { FormRowEdit, FormRowEdits } from '@researchdatabox/sails-ng-common';

type Path = (string | number)[];
type RowSource = { array: FormArray; index: number };

export class FormSaveRows {
  private readonly origins = new WeakMap<AbstractControl, RowSource>();
  private readonly needsReload = new WeakSet<FormArray>();
  private readonly rebuilt = new WeakSet<FormArray>();

  remember(array: FormArray, row: AbstractControl, index: number): void {
    this.origins.set(row, { array, index });
  }

  forget(array: FormArray): void {
    this.rebuilt.add(array);
  }

  snapshot(form: FormGroup | undefined, editable: (control: AbstractControl) => boolean, trackRows: boolean, updating = trackRows) {
    const rowEdits: FormRowEdits = {};
    const arrays: { key: string; array: FormArray; rows: AbstractControl[] }[] = [];

    const visit = (control: AbstractControl, path: Path, fromStorage: boolean): unknown => {
      if (control instanceof FormGroup) {
        return Object.fromEntries(Object.entries(control.controls)
          .filter(([, child]) => editable(child))
          .map(([key, child]) => [key, visit(child, [...path, key], fromStorage)]));
      }
      if (!(control instanceof FormArray)) return control.value;

      const disabledRows = control.controls.some(row => !editable(row));
      const changedByHook = this.needsReload.has(control);
      const unavailable = changedByHook || this.rebuilt.has(control);
      const structured = control.controls.some(row => row instanceof FormGroup || row instanceof FormArray);
      if (updating && ((disabledRows && (!trackRows || unavailable)) || (changedByHook && structured))) {
        throw new Error('Reload the form before saving repeatable rows whose loaded positions are unavailable.');
      }
      const trackArray = trackRows && !unavailable;
      const edits: FormRowEdit[] = [];
      const values: unknown[] = [];
      const rows: AbstractControl[] = [];
      for (const row of control.controls) {
        const source = this.origins.get(row);
        const origin = trackArray && fromStorage && source?.array === control ? source.index : null;
        const enabled = editable(row);
        if (!enabled && origin === null) continue;

        const position = values.length;
        rows.push(row);
        edits.push(!enabled && origin !== null ? { retain: origin } : origin);
        values.push(enabled ? visit(row, [...path, position], origin !== null) : null);
      }
      if (trackArray) {
        const key = JSON.stringify(path);
        rowEdits[key] = edits;
        arrays.push({ key, array: control, rows });
      }
      return values;
    };

    const metadata = form ? structuredClone(visit(form, [], true) as Record<string, unknown>) : {};
    return {
      metadata,
      rowEdits,
      markSaved: (counts?: Record<string, number>) => {
        if (!counts) return;
        for (const { key, array, rows } of arrays) {
          const count = counts[key];
          if (count === undefined) {
            this.needsReload.add(array);
            continue;
          }
          rows.forEach((row, index) => {
            if (index < count) this.remember(array, row, index);
            else this.origins.delete(row);
          });
        }
      },
    };
  }
}
