import { By } from '@angular/platform-browser';
import { FormConfigFrame, FormExpressionsConfigFrame, AvailableFormComponentDefinitionFrames } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions } from '../helpers.spec';
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { SimpleInputComponent } from './simple-input.component';
import { TabComponent, TabComponentLayout, TabContentComponent } from './tab.component';
import { TextAreaComponent } from './text-area.component';

const sourceMissing = '$not($exists(formData.rdmp.oid)) or formData.rdmp.oid = null or formData.rdmp.oid = ""';
const editFormProps = {
  oid: 'oid-generated-supplements', recordType: 'rdmp', editMode: true,
  formName: 'default-1.0-draft', downloadAndCreateOnInit: false,
};

// Angular receives the server's already mode-pruned definitions. Keep both
// variants in this fixture to represent the collector's pre-pruning input.
const editDefinitions = (definitions: AvailableFormComponentDefinitionFrames[]) =>
  definitions.filter(definition => definition.constraints?.allowModes?.includes('edit'));

function supplementConfig(name: string, initialOid: string | null, leakedViewLock = false): FormConfigFrame {
  const leafGates = (): FormExpressionsConfigFrame[] => [
    '/mainTab/about/rdmp::field.value.changed',
    `/mainTab/relationships/${name}::field.value.changed`,
  ].map((condition, index) => ({
    name: `source-gate-${index}`,
    config: {
      conditionKind: 'jsonpointer', condition, target: 'field.disabled',
      hasTemplate: true, template: sourceMissing, runOnFormReady: true,
    },
  }));
  return {
    name: 'supplement-action-and-row-gates',
    behaviours: [{
      name: 'scu-publication-source-ready',
      conditionKind: 'jsonata_query',
      condition: 'event.type = "form.definition.ready" and ($not($exists(runtimeContext.requestParams.rdmpOid)) or runtimeContext.requestParams.rdmpOid = null or runtimeContext.requestParams.rdmpOid = "")',
      runOnFormReady: true,
      actions: [{ type: 'setUIProperties', config: { properties: [
        { fieldPath: '/mainTab/about/gated_title', target: 'field.disabled', hasValueTemplate: true, valueTemplate: sourceMissing },
        // Negative control represents the old collector's view-only lock.
        // The host prunes that model, but retains this form-level instruction.
        ...(leakedViewLock ? [{ fieldPath: `/mainTab/relationships/${name}`, target: 'field.disabled' as const,
          hasValueTemplate: true, valueTemplate: sourceMissing }] : []),
      ] } }],
    }],
    componentDefinitions: [{
      name: 'mainTab',
      component: { class: 'TabComponent', config: { tabs: [
        {
          name: 'about',
          component: { class: 'TabContentComponent', config: { componentDefinitions: [{
            name: 'rdmp',
            component: { class: 'GroupComponent', config: { componentDefinitions: [{
              name: 'oid', component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
              model: { class: 'SimpleInputModel', config: { value: initialOid ?? '' } },
            }] } },
            model: { class: 'GroupModel', config: { value: { oid: initialOid ?? '' } } },
          }, {
            name: 'gated_title', component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { value: 'Unrelated source-gated field' } },
            expressions: leafGates(),
          }] } },
          layout: { class: 'TabContentLayout', config: { buttonLabel: 'Source' } },
        },
        {
          name: 'relationships',
          component: { class: 'TabContentComponent', config: { selected: true, componentDefinitions: editDefinitions([{
            // Exact pre-client shape: hidden view model and editable repeatable
            // have the same pointer. The server removes the view model for edit.
            name, constraints: { allowModes: ['view'] },
            component: { class: 'SimpleInputComponent', config: { type: 'hidden', visible: false } },
            model: { class: 'SimpleInputModel' },
            expressions: leafGates().slice(0, 1),
          }, {
            name,
            constraints: { allowModes: ['edit'] },
            component: { class: 'RepeatableComponent', config: {
              addButtonShow: true, allowZeroRows: false, hideWhenZeroRows: false,
              elementTemplate: {
                name: '',
                component: { class: 'GroupComponent', config: { componentDefinitions: [
                  {
                    name: 'related_title', component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                    model: { class: 'SimpleInputModel' }, layout: { class: 'InlineLayout' }, expressions: leafGates(),
                  },
                  {
                    name: 'related_url', component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                    model: { class: 'SimpleInputModel' }, layout: { class: 'InlineLayout' }, expressions: leafGates(),
                  },
                  {
                    name: 'related_notes', component: { class: 'TextAreaComponent', config: { rows: 1, cols: 20 } },
                    model: { class: 'TextAreaModel' }, layout: { class: 'InlineLayout' }, expressions: leafGates(),
                  },
                ] } },
                model: { class: 'GroupModel' }, layout: { class: 'RepeatableElementLayout' },
              },
            } },
            model: { class: 'RepeatableModel', config: { value: [{
              related_title: 'Existing title', related_url: 'https://example.invalid/existing', related_notes: 'Existing notes',
            }] } },
            layout: { class: 'DefaultLayout' },
          }]) } },
          layout: { class: 'TabContentLayout', config: { buttonLabel: 'Supplements' } },
        },
      ] } },
      layout: { class: 'TabLayout' },
    }],
  };
}

// Server-compiled JSONata is supplied by the standard dynamic-asset test seam.
// Hook tests independently evaluate both exact configured templates with JSONata.
function compiledGate(initializerEvents: string[]): DynamicAssetOptions {
  return { entries: [{
    urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp',
    callable: (_keyString, key, context: {
      formData?: { rdmp?: { oid?: string } | null }, event?: { type?: string },
      runtimeContext?: { requestParams?: { rdmpOid?: string } },
    }) => {
      if (key[0] === 'behaviours' && key[key.length - 1] === 'condition') {
        return context.event?.type === 'form.definition.ready' && !context.runtimeContext?.requestParams?.rdmpOid;
      }
      if (key[0] === 'behaviours') initializerEvents.push(context.event?.type ?? 'missing');
      return !context.formData?.rdmp?.oid;
    },
  }] };
}

describe('Repeatable source-gated row inputs with independent Add Item', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: {
      SimpleInputComponent, TextAreaComponent, GroupFieldComponent, RepeatableComponent,
      RepeatableElementLayoutComponent, TabComponent, TabComponentLayout, TabContentComponent,
    } });
  });

  for (const name of ['related_publications', 'related_websites', 'related_metadata', 'related_data']) {
    for (const initialOid of [null, 'forms-loaded-source']) {
      it(`${name}: keeps Add Item enabled and gates existing/new rows for ${initialOid ? 'loaded' : 'empty'} source`, async () => {
        const initializerEvents: string[] = [];
        const { fixture, formComponent } = await createFormAndWaitForReady(
          supplementConfig(name, initialOid), editFormProps, undefined, compiledGate(initializerEvents),
        );
        // The ready event starts a fire-and-forget asynchronous behaviour.
        // Drain that event turn before asserting its DOM effects.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        await fixture.whenStable();
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        const repeatable = fixture.debugElement.query(By.directive(RepeatableComponent)).componentInstance as RepeatableComponent;
        const source = formComponent.form?.get('rdmp');
        expect(source).toBeDefined();
        const addButton = element.querySelector<HTMLButtonElement>('.rb-form-repeatable__add');
        expect(addButton).not.toBeNull();
        const rowInputs = () => Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'redbox-form-repeatable input[type="text"], redbox-form-repeatable textarea',
        ));
        const assertRows = (count: number, disabled: boolean) => {
          expect(rowInputs()).toHaveSize(count * 3);
          expect(rowInputs().map(input => input.disabled)).toEqual(Array(count * 3).fill(disabled));
          expect(addButton?.disabled).toBeFalse();
          expect(repeatable.isDisabled).toBeFalse();
        };
        assertRows(1, !initialOid);
        expect(initializerEvents).toEqual(['form.definition.ready']);
        expect(formComponent.form?.get('gated_title')?.disabled).toBe(!initialOid);
        expect(formComponent.getComponentDefByName(name)?.component).toBe(repeatable);

        // Real DOM Add, including after form-ready while the source is missing.
        addButton?.click();
        await fixture.whenStable();
        assertRows(2, !initialOid);

        source?.setValue({ oid: 'forms-source-a' });
        await fixture.whenStable();
        assertRows(2, false);
        addButton?.click();
        await fixture.whenStable();
        assertRows(3, false);

        const inputs = rowInputs();
        const enteredRow = ['Forms new title', 'https://example.invalid/forms-new', 'Forms new notes'];
        for (const [index, value] of enteredRow.entries()) {
          inputs[index + 6].value = value;
          inputs[index + 6].dispatchEvent(new Event('input', { bubbles: true }));
        }
        await fixture.whenStable();
        const populated = formComponent.getDebugFormValue()[name];
        expect(populated).toEqual([
          { related_title: 'Existing title', related_url: 'https://example.invalid/existing', related_notes: 'Existing notes' },
          { related_title: null, related_url: null, related_notes: null },
          { related_title: enteredRow[0], related_url: enteredRow[1], related_notes: enteredRow[2] },
        ]);

        source?.setValue({ oid: 'forms-source-b' });
        await fixture.whenStable();
        assertRows(3, false);
        expect(formComponent.getDebugFormValue()[name]).toEqual(populated);
        source?.reset();
        await fixture.whenStable();
        assertRows(3, true);
        expect(formComponent.getDebugFormValue()[name]).toEqual(populated);
        expect(JSON.stringify(formComponent['getPersistedFormValue']()[name])).toBe(JSON.stringify(populated));
        expect(formComponent.getDebugRawFormValue()[name]).toEqual(populated);

        // Disabled inputs still persist their data; row actions stay independent.
        addButton?.click();
        await fixture.whenStable();
        assertRows(4, true);
        expect(formComponent.getDebugFormValue()[name]).toEqual([
          ...(populated as unknown[]), { related_title: null, related_url: null, related_notes: null },
        ]);
        expect(JSON.stringify(formComponent['getPersistedFormValue']()[name])).toBe(JSON.stringify([
          ...(populated as unknown[]), { related_title: null, related_url: null, related_notes: null },
        ]));
        expect(initializerEvents).toEqual(['form.definition.ready']);
      });
    }
  }

  it('reproduces the disabled Add action when a pruned view model leaks its same-pointer initializer lock', async () => {
    const initializerEvents: string[] = [];
    const { fixture } = await createFormAndWaitForReady(
      supplementConfig('related_publications', null, true), editFormProps, undefined, compiledGate(initializerEvents),
    );
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const repeatable = fixture.debugElement.query(By.directive(RepeatableComponent)).componentInstance as RepeatableComponent;
    expect(repeatable.isDisabled).toBeTrue();
    expect(element.querySelector<HTMLButtonElement>('.rb-form-repeatable__add')?.disabled).toBeTrue();
    expect(Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'redbox-form-repeatable input[type="text"], redbox-form-repeatable textarea',
    )).every(input => input.disabled)).toBeTrue();
    expect(initializerEvents).toEqual(['form.definition.ready', 'form.definition.ready']);
  });
});
