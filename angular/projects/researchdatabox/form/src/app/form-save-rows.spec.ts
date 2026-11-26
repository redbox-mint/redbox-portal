import { FormArray, FormControl, FormGroup } from '@angular/forms';
import type { FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { FormSaveRows } from './form-save-rows';

describe('FormSaveRows', () => {
  it('tracks original controls through editing, sorting, deletion, re-saving and adding', () => {
    const first = new FormControl('First');
    const removed = new FormControl('Removed');
    const last = new FormControl('Last');
    const list = new FormArray([first, removed, last]);
    const form = new FormGroup({ list });
    const rows = new FormSaveRows();
    list.controls.forEach((row, index) => rows.setInitialIndex(list, row, index));

    const added = new FormControl('New');
    list.removeAt(2);
    list.removeAt(1);
    list.insert(0, last);
    list.push(added);
    rows.markNew(added);
    last.setValue('Last edited');
    const save = rows.serialize(form, [], () => true, true);
    expect(save.metadata).toEqual({ list: ['Last edited', 'First', 'New'] });
    expect(save.rowOrigins).toEqual({ '["list"]': [2, 0, 'new'] });

    save.markSaved();
    first.disable();
    const next = rows.serialize(form, [], () => true, true);
    expect(next.metadata).toEqual({ list: ['Last edited', null, 'New'] });
    expect(next.rowOrigins).toEqual({ '["list"]': [0, { retain: 1 }, 2] });
  });

  it('omits nested disabled controls and includes controls enabled at runtime', () => {
    const locked = new FormControl('Locked');
    const conditional = new FormControl({ value: 'Enabled', disabled: true });
    const group = new FormGroup({ locked, conditional });
    const form = new FormGroup({ group });
    const entries = [
      {
        model: { formControl: group },
        component: { formFieldCompMapEntries: [{ model: { formControl: locked } }] },
      },
    ] as unknown as FormFieldCompMapEntry[];
    const rows = new FormSaveRows();
    const include = (entry: FormFieldCompMapEntry) => entry.model?.formControl !== locked;
    expect(rows.serialize(form, entries, include, true).metadata).toEqual({ group: {} });
    conditional.enable();
    expect(rows.serialize(form, entries, include, true).metadata).toEqual({ group: { conditional: 'Enabled' } });
  });
});
