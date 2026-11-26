import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import type { FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import type { FormSaveRowOrigin } from '@researchdatabox/sails-ng-common';

export class FormSaveRows {
  private origins = new WeakMap<AbstractControl, { parent: FormArray; index: number }>();
  private newRows = new WeakSet<AbstractControl>();

  reset(): void {
    this.origins = new WeakMap();
    this.newRows = new WeakSet();
  }

  setInitialIndex(parent: FormArray, row: AbstractControl, index: number): void {
    this.origins.set(row, { parent, index });
  }

  markNew(control: AbstractControl): void {
    this.newRows.add(control);
  }

  serialize(form: FormGroup | undefined, components: FormFieldCompMapEntry[], include: (entry: FormFieldCompMapEntry) => boolean, preserveDisabledRows: boolean) {
    const blocked = new Set<AbstractControl>();
    const collectBlocked = (entry: FormFieldCompMapEntry, parentBlocked: boolean) => {
      const isBlocked = parentBlocked || !include(entry);
      const control = entry.model?.formControl;
      if (isBlocked && control) {
        blocked.add(control);
      }
      entry.component?.formFieldCompMapEntries?.forEach(child => collectBlocked(child, isBlocked));
    };
    components.forEach(entry => collectBlocked(entry, false));

    const rowOrigins: Record<string, FormSaveRowOrigin[]> = {};
    const savedRows: [AbstractControl, { parent: FormArray; index: number }][] = [];
    const excluded = (control: AbstractControl) => control.disabled || blocked.has(control);
    const valueFor = (control: AbstractControl, path: (string | number)[], hasPrevious: boolean): unknown => {
      if (control instanceof FormGroup) {
        return Object.fromEntries(Object.entries(control.controls)
          .filter(([, child]) => !excluded(child))
          .map(([name, child]) => [name, valueFor(child, [...path, name], hasPrevious)]));
      }
      if (control instanceof FormArray) {
        const values: unknown[] = [];
        const references: FormSaveRowOrigin[] = [];
        for (const row of control.controls) {
          const origin = this.origins.get(row);
          const index = hasPrevious && origin?.parent === control ? origin.index : undefined;
          if (excluded(row) && index === undefined) {
            continue;
          }
          const position = values.length;
          const retain = excluded(row) && index !== undefined;
          references.push(retain ? { retain: index } : index ?? (this.newRows.has(row) ? 'new' : null));
          values.push(retain ? null : valueFor(row, [...path, position], index !== undefined));
          savedRows.push([row, { parent: control, index: position }]);
        }
        rowOrigins[JSON.stringify(path)] = references;
        return values;
      }
      return control.value;
    };
    const metadata = form ? structuredClone(valueFor(form, [], preserveDisabledRows) as Record<string, unknown>) : {};
    return {
      metadata,
      rowOrigins,
      markSaved: () => {
        for (const [row, origin] of savedRows) {
          this.origins.set(row, origin);
          this.newRows.delete(row);
        }
      },
    };
  }
}
