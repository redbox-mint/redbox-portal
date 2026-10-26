import { By } from '@angular/platform-browser';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { SimpleInputComponent } from './simple-input.component';
import { TextAreaComponent } from './text-area.component';

const config: FormConfigFrame = { name: 'native-label-state', componentDefinitions: [{
  name: 'title', component: { class: 'SimpleInputComponent', config: { type: 'text' } },
  model: { class: 'SimpleInputModel', config: { value: 'preserved', validators: [{ class: 'required' }] } },
  layout: { class: 'DefaultLayout', config: { label: 'Title' } },
}, {
  name: 'notes', component: { class: 'TextAreaComponent', config: { rows: 1, cols: 20 } },
  model: { class: 'TextAreaModel', config: { value: '' } },
  layout: { class: 'InlineLayout', config: { label: 'Notes' } },
}] };

describe('Native labels and form state', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent, TextAreaComponent } });
  });

  it('keeps label association in sync with dynamic input type', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(structuredClone(config));
    const field: SimpleInputComponent = fixture.debugElement.query(By.directive(SimpleInputComponent)).componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    const input = root.querySelector('input')!;
    const label = root.querySelector('label')!;
    const id = input.id;
    const value = formComponent.form?.getRawValue();
    expect(label.control).toBe(input);
    field.setProperty('type', 'hidden');
    fixture.detectChanges();
    expect(input.type).toBe('hidden');
    expect(input.hasAttribute('id')).toBeFalse();
    expect(label.hasAttribute('for')).toBeFalse();
    field.setProperty('type', 'email');
    fixture.detectChanges();
    expect(input.type).toBe('email');
    expect(input.id).toBe(id);
    expect(label.control).toBe(input);
    label.click();
    expect(document.activeElement).toBe(input);
    expect(formComponent.form?.getRawValue()).toEqual(value);
    expect(formComponent.form?.pristine).toBeTrue();
    expect(formComponent.form?.untouched).toBeTrue();
    expect(formComponent.form?.valid).toBeTrue();
  });

  it('restores the same association after visibility changes and keeps IDs out of config and values on reload', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(structuredClone(config));
    const root: HTMLElement = fixture.nativeElement;
    const field: TextAreaComponent = fixture.debugElement.query(By.directive(TextAreaComponent)).componentInstance;
    const textarea = root.querySelector('textarea')!;
    const label = root.querySelector<HTMLLabelElement>('.rb-form-inline-label')!;
    const id = textarea.id;
    const entry = field.formFieldCompMapEntry!;
    const serializedConfig = JSON.stringify(entry.compConfigJson);
    const value = formComponent.form?.getRawValue();
    field.setProperty('visible', false);
    fixture.detectChanges();
    expect(root.querySelector('textarea')).toBeNull();
    field.setProperty('visible', true);
    fixture.detectChanges();
    const restored = root.querySelector('textarea')!;
    expect(restored.id).toBe(id);
    expect(label.control).toBe(restored);
    label.click();
    expect(document.activeElement).toBe(restored);
    expect(formComponent.form?.getRawValue()).toEqual(value);
    expect(serializedConfig).not.toContain('labelableControlId');
    expect(serializedConfig).not.toContain(id);
    const reloaded = await createFormAndWaitForReady(structuredClone(config));
    const reloadedRoot: HTMLElement = reloaded.fixture.nativeElement;
    expect(reloadedRoot.querySelector('textarea')!.id).not.toBe(id);
    expect(reloadedRoot.querySelector<HTMLLabelElement>('.rb-form-inline-label')!.control).toBe(reloadedRoot.querySelector('textarea'));
    expect(reloaded.formComponent.form?.getRawValue()).toEqual(value);
    expect(reloaded.formComponent.form?.pristine).toBeTrue();
    expect(reloaded.formComponent.form?.untouched).toBeTrue();
  });

  it('focuses an initially hidden input after its type becomes text', async () => {
    const hiddenConfig = structuredClone(config);
    hiddenConfig.componentDefinitions![0] = {
      name: 'title', component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
      model: { class: 'SimpleInputModel', config: { value: 'preserved' } },
      layout: { class: 'InlineLayout', config: { label: 'Title' } },
    };
    const { fixture } = await createFormAndWaitForReady(hiddenConfig);
    const field: SimpleInputComponent = fixture.debugElement.query(By.directive(SimpleInputComponent)).componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    const input = root.querySelector('input')!;
    const label = root.querySelector('label')!;
    expect(input.type).toBe('hidden');
    expect(label.hasAttribute('for')).toBeFalse();
    field.setProperty('type', 'text');
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(label.control).toBe(input);
    label.click();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('preserved');
  });
});
