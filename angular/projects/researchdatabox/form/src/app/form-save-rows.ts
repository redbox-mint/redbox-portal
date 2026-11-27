import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import type { FormRowEdit, FormRowEdits, FormRowProofs } from '@researchdatabox/sails-ng-common';

type Path = (string | number)[];
type RowSource = { array: FormArray; index: number; proof?: string };
type ReadOnlyRows = { renderedCount: () => number; loaded: boolean };

export class FormSaveRows {
  private readonly bound = new WeakSet<FormGroup>();
  private readonly origins = new WeakMap<AbstractControl, RowSource>();
  private readonly needsReload = new WeakSet<FormArray>();
  private readonly rebuilt = new WeakSet<FormArray>();
  private readonly imported = new WeakMap<FormArray, () => boolean>();
  private readonly readOnlyRows = new WeakMap<FormArray, ReadOnlyRows>();

  markRowsReadOnly(array: FormArray, renderedCount: () => number): void {
    this.readOnlyRows.set(array, { renderedCount, loaded: false });
  }

  canTrack(array: FormArray, form: FormGroup, proofs: FormRowProofs): boolean {
    this.bindProofs(form, proofs);
    let control: AbstractControl | null = array;
    while (control) {
      if (control instanceof FormArray && (this.rebuilt.has(control) || this.needsReload.has(control))) return false;
      const parent: FormGroup | FormArray | null = control.parent;
      if (parent instanceof FormArray && !this.hasProof(parent, control)) return false;
      control = parent;
    }
    return this.hasTrackedReadOnlyRows(array);
  }

  private hasTrackedReadOnlyRows(array: FormArray): boolean {
    const rows = this.readOnlyRows.get(array);
    return !!rows?.loaded && this.matchesRenderedRows(array, rows);
  }

  private matchesRenderedRows(array: FormArray, rows: ReadOnlyRows): boolean {
    return rows.renderedCount() === array.length && array.controls.every(row => this.hasProof(array, row));
  }

  private hasProof(array: FormArray, row: AbstractControl): boolean {
    const source = this.origins.get(row);
    return source?.array === array && !!source.proof;
  }

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
        const loadedProofs = proofs[JSON.stringify(path)];
        for (const child of control.controls) {
          const source = this.origins.get(child);
          if (source?.array !== control) continue;
          source.proof = loadedProofs?.[source.index];
          bind(child, [...path, source.index]);
        }
        const rows = this.readOnlyRows.get(control);
        if (rows) {
          // Only a list initialized with tracked rows can later submit an intentional empty list.
          rows.loaded = control.length > 0 && control.length === loadedProofs?.length &&
            this.matchesRenderedRows(control, rows);
        }
      }
    };
    bind(form, []);
  }

  forget(array: FormArray): void {
    this.rebuilt.add(array);
    this.imported.delete(array);
  }

  importRows(array: FormArray, isComplete: () => boolean): void {
    this.imported.set(array, isComplete);
  }

  isLoadedRow(array: FormArray, row: AbstractControl): boolean {
    return this.origins.get(row)?.array === array;
  }

  hasPendingImport(control: AbstractControl): boolean {
    if (control instanceof FormArray) {
      const imported = this.imported.get(control);
      return (imported !== undefined && !imported()) ||
        control.controls.some(row => this.hasPendingImport(row));
    }
    return control instanceof FormGroup &&
      Object.values(control.controls).some(child => this.hasPendingImport(child));
  }

  snapshot(
    form: FormGroup | undefined, included: (control: AbstractControl) => boolean,
    proofs?: FormRowProofs, updating = !!proofs, editableRowPaths?: string[]
  ) {
    const trackRows = !!proofs;
    const allowedLists = editableRowPaths && new Set(editableRowPaths);
    if (form && proofs) this.bindProofs(form, proofs);
    const rowEdits: FormRowEdits = {};
    const arrays: { key: string; array: FormArray; rows: AbstractControl[]; imported?: () => boolean }[] = [];

    const omitted = Symbol();
    const visit = (control: AbstractControl, path: Path, fromStorage: boolean, trackBranch: boolean, root = false): unknown => {
      if (!root && (!included(control) || (control.disabled && !(trackRows &&
        (control instanceof FormGroup || control instanceof FormArray))))) {
        return omitted;
      }
      if (control instanceof FormGroup) {
        const children = Object.entries(control.controls).flatMap(([key, child]) => {
          const value = visit(child, [...path, key], fromStorage, trackBranch);
          return value === omitted ? [] : [[key, value]];
        });
        // A container can be disabled because its children are disabled. Keep any
        // repeatable edits below it, but omit a disabled group with no edits to send.
        return control.disabled && !children.length && !root ? omitted : Object.fromEntries(children);
      }
      if (!(control instanceof FormArray)) return control.value;
      const schemaPath = JSON.stringify(path.map(part => typeof part === 'number' ? null : part));
      if (allowedLists && !allowedLists.has(schemaPath)) return omitted;

      const changedByHook = this.needsReload.has(control);
      const unavailable = changedByHook || this.rebuilt.has(control);
      // The server uses the ordinary merge below a list without row edits.
      const trackArray = trackBranch && !unavailable;
      const readOnlyRows = this.readOnlyRows.has(control);
      if (readOnlyRows && (!trackArray || !fromStorage || !this.hasTrackedReadOnlyRows(control))) return omitted;
      const structured = control.controls.some(row => row instanceof FormGroup || row instanceof FormArray);
      if (trackBranch && updating && changedByHook && structured) {
        throw new Error('Reload the form before saving repeatable rows whose loaded positions are unavailable.');
      }
      const imported = this.imported.get(control);
      const incompleteImport = () => new Error('Some imported repeatable rows cannot be saved. Reload the form and retry.');
      if (updating && imported && !imported()) throw incompleteImport();
      const edits: FormRowEdit[] = [];
      const values: unknown[] = [];
      const rows: AbstractControl[] = [];
      for (const row of control.controls) {
        const source = this.origins.get(row);
        const origin = trackArray && fromStorage && source?.array === control ? source : undefined;
        const value = readOnlyRows ? omitted : visit(row, [...path, values.length], !!origin, trackArray);
        const retain = value === omitted;
        if (retain && updating && !trackArray) {
          throw new Error('Reload the form before saving repeatable rows whose loaded positions are unavailable.');
        }
        if (retain && !origin) {
          if (trackArray && imported) throw incompleteImport();
          continue;
        }
        if (origin && !origin.proof) {
          throw new Error('A repeatable row no longer corresponds to its loaded position. Reload the form and retry.');
        }

        rows.push(row);
        edits.push(origin?.proof ? { source: origin.index, proof: origin.proof, ...(retain ? { retain: true } : {}) } : null);
        values.push(retain ? null : value);
      }
      if (trackArray) {
        const key = JSON.stringify(path);
        rowEdits[key] = edits;
        arrays.push({ key, array: control, rows, imported });
      }
      return values;
    };

    const metadata = form ? structuredClone(visit(form, [], true, trackRows, true) as Record<string, unknown>) : {};
    return {
      metadata,
      rowEdits,
      markSaved: (savedProofs?: FormRowProofs) => {
        if (!savedProofs) return;
        for (const { key, array, rows, imported } of arrays) {
          const proofs = savedProofs[key];
          if (proofs === undefined) {
            this.needsReload.add(array);
            continue;
          }
          if (imported === this.imported.get(array)) this.imported.delete(array);
          const readOnly = this.readOnlyRows.get(array);
          if (readOnly && !rows.length && !proofs.length) readOnly.loaded = false;
          rows.forEach((row, index) => {
            if (index < proofs.length) this.origins.set(row, { array, index, proof: proofs[index] });
            else this.origins.delete(row);
          });
        }
      },
    };
  }
}
