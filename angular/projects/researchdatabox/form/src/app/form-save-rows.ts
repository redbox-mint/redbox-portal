import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import type { FormRowEdit, FormRowEdits, FormRowProofs } from '@researchdatabox/sails-ng-common';

type Path = (string | number)[];
type RowSource = { array: FormArray; index: number; proof?: string };

export class FormSaveRows {
  private readonly bound = new WeakSet<FormGroup>();
  private readonly origins = new WeakMap<AbstractControl, RowSource>();
  private readonly needsReload = new WeakSet<FormArray>();
  private readonly rebuilt = new WeakSet<FormArray>();

  remember(array: FormArray, row: AbstractControl, index: number): void {
    this.origins.set(row, { array, index });
  }

  private bindProofs(form: FormGroup, proofs: FormRowProofs): void {
    if (this.bound.has(form)) return;
    this.bound.add(form);
    const bind = (control: AbstractControl, path: Path): void => {
      if (control instanceof FormGroup) {
        for (const [key, child] of Object.entries(control.controls)) bind(child, [...path, key]);
      } else if (control instanceof FormArray) {
        for (const child of control.controls) {
          const source = this.origins.get(child);
          if (source?.array !== control) continue;
          source.proof = proofs[JSON.stringify(path)]?.[source.index];
          bind(child, [...path, source.index]);
        }
      }
    };
    bind(form, []);
  }

  forget(array: FormArray): void {
    this.rebuilt.add(array);
  }

  snapshot(form: FormGroup | undefined, editable: (control: AbstractControl) => boolean, proofs?: FormRowProofs, updating = !!proofs) {
    const trackRows = !!proofs;
    if (form && proofs) this.bindProofs(form, proofs);
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
        const origin = trackArray && fromStorage && source?.array === control ? source : undefined;
        const enabled = editable(row);
        if (!enabled && !origin) continue;
        if (origin && !origin.proof) {
          throw new Error('A repeatable row no longer corresponds to its loaded position. Reload the form and retry.');
        }

        const position = values.length;
        rows.push(row);
        edits.push(origin?.proof ? { source: origin.index, proof: origin.proof, ...(!enabled ? { retain: true } : {}) } : null);
        values.push(enabled ? visit(row, [...path, position], !!origin) : null);
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
      markSaved: (savedProofs?: FormRowProofs) => {
        if (!savedProofs) return;
        for (const { key, array, rows } of arrays) {
          const proofs = savedProofs[key];
          if (proofs === undefined) {
            this.needsReload.add(array);
            continue;
          }
          rows.forEach((row, index) => {
            if (index < proofs.length) this.origins.set(row, { array, index, proof: proofs[index] });
            else this.origins.delete(row);
          });
        }
      },
    };
  }
}
