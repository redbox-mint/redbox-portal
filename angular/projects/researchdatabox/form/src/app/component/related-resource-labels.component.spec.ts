import { By } from '@angular/platform-browser';
import { AvailableFormComponentDefinitionFrames, FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { SimpleInputComponent } from './simple-input.component';
import { TextAreaComponent } from './text-area.component';

const resourceNames = ['related_publications', 'related_websites', 'related_metadata', 'related_data'];
const leafLabels = ['Name', 'URL', 'Notes'];
type NativeInput = HTMLInputElement | HTMLTextAreaElement;

function resourceRows(name: string) {
  return ['first', 'second'].map(row => ({
    related_title: `${name} ${row}`,
    related_url: `https://example.invalid/${name}/${row}`,
    related_notes: `${name} ${row} notes`,
  }));
}

function supplements(): FormConfigFrame {
  // Exact SCU row layout and native control/model classes after server pruning.
  return { name: 'publication-supplements', componentDefinitions: resourceNames.map<AvailableFormComponentDefinitionFrames>(name => ({
    name,
    component: { class: 'RepeatableComponent', config: {
      addButtonShow: true, allowZeroRows: false, hideWhenZeroRows: false,
      elementTemplate: {
        name: '',
        component: { class: 'GroupComponent', config: {
          hostCssClasses: 'rb-form-related-link-inline',
          componentDefinitions: [{
            name: 'related_title',
            component: { class: 'SimpleInputComponent', config: { label: 'Name', type: 'text', placeholder: '' } },
            model: { class: 'SimpleInputModel' },
            layout: { class: 'InlineLayout', config: { label: 'Name' } },
          }, {
            name: 'related_url',
            component: { class: 'SimpleInputComponent', config: { label: 'URL', type: 'text', placeholder: '' } },
            model: { class: 'SimpleInputModel' },
            layout: { class: 'InlineLayout', config: { label: 'URL' } },
          }, {
            name: 'related_notes',
            component: { class: 'TextAreaComponent', config: { label: 'Notes', rows: 1, cols: 20, placeholder: '' } },
            model: { class: 'TextAreaModel' },
            layout: { class: 'InlineLayout', config: { label: 'Notes' } },
          }],
        } },
        model: { class: 'GroupModel' },
        layout: { class: 'RepeatableElementLayout', config: {
          hostCssClasses: 'rb-form-action-row-layout',
          containerCssClass: 'rb-form-action-row rb-form-action-row--legacy-inline',
          alignment: 'start', wrap: true, slotCssClass: 'rb-form-action-slot', compact: true,
        } },
      },
    } },
    model: { class: 'RepeatableModel', config: { value: resourceRows(name) } },
    layout: { class: 'DefaultLayout', config: { label: name } },
  })) };
}

function rowControls(root: HTMLElement): NativeInput[] {
  return Array.from(root.querySelectorAll<NativeInput>('redbox-form-repeatable input[type="text"], redbox-form-repeatable textarea'));
}

function assertNativeLabels(controls: NativeInput[]) {
  expect(new Set(controls.map(control => control.id)).size).toBe(controls.length);
  for (const [index, control] of controls.entries()) {
    expect(control.id).toBeTruthy();
    expect(control.labels?.length).toBe(1);
    const label = control.labels?.[0];
    expect(label).toBeDefined();
    expect(label?.htmlFor).toBe(control.id);
    expect(label?.control).toBe(control);
    expect(label?.textContent?.trim()).toBe(leafLabels[index % 3]);
    expect(control.getAttribute('placeholder')).toBe('');
    expect(control.getAttribute('title')).toBe('');
    expect(document.getElementById(control.id)).toBe(control);
    label?.click();
    expect(document.activeElement).toBe(control);
  }
}

const editProps = {
  oid: 'publication-labels', recordType: 'dataPublication', editMode: true,
  formName: 'dataPublication-1.0-draft', downloadAndCreateOnInit: false,
};

describe('LIVEFORM-195 native labels on repeated related resources', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: {
      SimpleInputComponent, TextAreaComponent, GroupFieldComponent,
      RepeatableComponent, RepeatableElementLayoutComponent,
    } });
  });

  it('names and focuses all 24 controls, including all eight Notes textareas', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(supplements(), editProps);
    const root = fixture.nativeElement as HTMLElement;
    const before = formComponent.form?.getRawValue();
    const controls = rowControls(root);
    expect(controls.length).toBe(24);
    expect(controls.filter(control => control.tagName === 'TEXTAREA').length).toBe(8);
    assertNativeLabels(controls);
    fixture.detectChanges();
    expect(rowControls(root).map(control => control.id)).toEqual(controls.map(control => control.id));
    expect(formComponent.form?.getRawValue()).toEqual(before);
    expect(formComponent.form?.pristine).toBeTrue();
    expect(before).toEqual(Object.fromEntries(resourceNames.map(name => [name, resourceRows(name)])));
    // The repeatable's group label must not target a descendant's input.
    expect(Array.from(root.querySelectorAll<HTMLLabelElement>('label.rb-form-field-label'))
      .every(label => !label.hasAttribute('for'))).toBeTrue();
  });

  it('keeps associations, row order and values after editing, removing the first row and adding a replacement', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(supplements(), editProps);
    const root = fixture.nativeElement as HTMLElement;
    const repeatables = fixture.debugElement.queryAll(By.directive(RepeatableComponent));
    expect(repeatables.length).toBe(4);
    for (const [groupIndex, name] of resourceNames.entries()) {
      const groupRoot = repeatables[groupIndex].nativeElement as HTMLElement;
      const originalRows = resourceRows(name);
      const secondRow = rowControls(groupRoot).slice(3);
      const editedNotes = `${name} edited second-row notes`;
      secondRow[2].value = editedNotes;
      secondRow[2].dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      const expectedSecond = { ...originalRows[1], related_notes: editedNotes };
      expect(formComponent.form?.getRawValue()[name]).toEqual([originalRows[0], expectedSecond]);
      groupRoot.querySelector<HTMLButtonElement>('.rb-form-repeatable-item__remove')!.click();
      await fixture.whenStable();
      expect(formComponent.form?.getRawValue()[name]).toEqual([expectedSecond]);
      expect(rowControls(groupRoot)).toEqual(secondRow);
      assertNativeLabels(rowControls(groupRoot));
      groupRoot.querySelector<HTMLButtonElement>('.rb-form-repeatable__add')!.click();
      await fixture.whenStable();
      const controls = rowControls(groupRoot);
      expect(controls.length).toBe(6);
      expect(controls.slice(0, 3)).toEqual(secondRow);
      for (const [index, value] of Object.values(originalRows[0]).entries()) {
        controls[index + 3].value = value;
        controls[index + 3].dispatchEvent(new Event('input', { bubbles: true }));
      }
      await fixture.whenStable();
      expect(formComponent.form?.getRawValue()[name]).toEqual([expectedSecond, originalRows[0]]);
      assertNativeLabels(controls);
    }
    assertNativeLabels(rowControls(root));
  });

  it('gives simultaneous instances of the same form distinct IDs and local label targets', async () => {
    const first = await createFormAndWaitForReady(supplements(), editProps);
    const second = await createFormAndWaitForReady(supplements(), editProps);
    // Angular's root renderer detaches earlier fixture roots on creation.
    document.body.appendChild(first.fixture.nativeElement);
    const controls = [first, second].flatMap(({ fixture }) => rowControls(fixture.nativeElement));
    expect(controls.length).toBe(48);
    assertNativeLabels(controls);
    expect(first.formComponent.form?.getRawValue()).toEqual(second.formComponent.form?.getRawValue());
  });

  it('also labels a default-layout textarea while leaving hidden inputs without a label target', async () => {
    const { fixture } = await createFormAndWaitForReady({ name: 'default-notes-label', componentDefinitions: [{
      name: 'notes', component: { class: 'TextAreaComponent' },
      model: { class: 'TextAreaModel', config: { value: 'Existing notes' } },
      layout: { class: 'DefaultLayout', config: { label: 'Notes' } },
    }, {
      name: 'hidden', component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
      model: { class: 'SimpleInputModel' },
      layout: { class: 'InlineLayout', config: { label: 'Hidden' } },
    }] }, editProps);
    const root = fixture.nativeElement as HTMLElement;
    const textarea = root.querySelector('textarea')!;
    const label = root.querySelector<HTMLLabelElement>('label.rb-form-field-label')!;
    expect(textarea.id).toBeTruthy();
    expect(label.control).toBe(textarea);
    expect(textarea.labels?.[0]).toBe(label);
    label.click();
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe('Existing notes');
    expect(root.querySelector('label.rb-form-inline-label')?.hasAttribute('for')).toBeFalse();
    expect(root.querySelector('input[type="hidden"]')?.hasAttribute('id')).toBeFalse();
  });
});
