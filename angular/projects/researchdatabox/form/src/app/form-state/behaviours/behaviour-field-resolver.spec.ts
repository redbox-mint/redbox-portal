import { FormControl } from '@angular/forms';
import { resolveFieldByPointer, resolveFieldEntryByPointer } from './behaviour-field-resolver';

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

  it('resolves a model-less button for UI actions while rejecting it as a writable value target', () => {
    const entry = { compConfigJson: { name: 'submit', component: { class: 'SaveButtonComponent' } } };
    const context = {
      formComponent: {
        getQuerySource: () => ({ jsonPointerSource: { submit: { metadata: { formFieldEntry: entry } } } }),
      },
    } as Parameters<typeof resolveFieldEntryByPointer>[1];
    expect(resolveFieldEntryByPointer('/submit', context)?.entry).toBe(entry);
    expect(resolveFieldByPointer('/submit', context)).toBeUndefined();
  });
});
