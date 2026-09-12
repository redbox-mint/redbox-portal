import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { resolveFieldByIdentity, resolveFieldByPointer } from './behaviour-field-resolver';

describe('logical behaviour targets', () => {
  function setup() {
    const rows = new FormArray(['Alpha', 'Beta', 'Gamma'].map(value => new FormGroup({ value: new FormControl(value) })));
    const target = rows.at(1).controls.value;
    const entry = { model: { formControl: target } } as unknown as FormFieldCompMapEntry;
    const ctx = { formComponent: { form: new FormGroup({ rows }), getQuerySource: () => undefined } };
    return { rows, target, entry, ctx };
  }

  it('applies a delayed result to the same row after removing a preceding row', () => {
    const { rows, target, entry, ctx } = setup();
    rows.removeAt(0);
    resolveFieldByIdentity(entry, ctx)?.control.setValue('Beta updated');
    expect(rows.getRawValue()).toEqual([{ value: 'Beta updated' }, { value: 'Gamma' }]);
    expect(rows.at(0).controls.value).toBe(target);
  });

  it('discards a delayed result when its row has been removed', () => {
    const { rows, entry, ctx } = setup();
    rows.removeAt(1);
    const resolved = resolveFieldByIdentity(entry, ctx);
    expect(resolved).toBeUndefined();
    resolved?.control.setValue('Must not reach Gamma');
    expect(rows.getRawValue()).toEqual([{ value: 'Alpha' }, { value: 'Gamma' }]);
  });
});

/**
 * Verifies the pointer-to-control contract used by `setValue` actions.
 */
describe('resolveFieldByPointer', () => {
  it('resolves a writable form field from the query source json pointer tree', () => {
    const control = new FormControl('');
    const entry = {
      model: { formControl: control },
      lineagePaths: { angularComponentsJsonPointer: '/main/title' },
    } as any;

    const resolved = resolveFieldByPointer('/main/title', {
      formComponent: {
        getQuerySource: () => ({
          queryOrigSource: [],
          querySource: [],
          jsonPointerSource: {
            main: {
              title: {
                metadata: {
                  formFieldEntry: entry,
                },
              },
            },
          },
        }),
      } as any,
    });

    expect(resolved?.entry).toBe(entry);
    expect(resolved?.control).toBe(control);
  });

  it('returns undefined when the target is missing or has no form control', () => {
    const resolved = resolveFieldByPointer('/main/missing', {
      formComponent: {
        getQuerySource: () => ({
          queryOrigSource: [],
          querySource: [],
          jsonPointerSource: { main: {} },
        }),
      } as any,
    });

    expect(resolved).toBeUndefined();
  });
});
