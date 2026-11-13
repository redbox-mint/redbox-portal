import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TypeaheadModule, TypeaheadMatch } from 'ngx-bootstrap/typeahead';
import { FormConfigFrame, GroupFormComponentDefinitionFrame, TypeaheadOption } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TypeaheadInputComponent } from './typeahead-input.component';
import { SimpleInputComponent } from './simple-input.component';
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { ValidationSummaryFieldComponent } from './validation-summary.component';
import { FormComponentEventBus } from '../form-state';
import { FormComponentItemSelectEventProducer } from '../form-state/events/form-component-item-select-event-producer';

// Exercise the real wrapper/producer/consumer path, including silent sibling
// writes and summary refresh. No directory or record service is needed.
describe('Typeahead dependent fields', () => {
  const saved = { name: 'Saved Person', email: 'saved@example.edu', identity: 'saved-id', notes: 'Manual notes' };
  const option: TypeaheadOption = {
    label: 'Selected Person', value: 'Selected Person',
    raw: { metadata: { email: 'selected@example.edu' }, ID: 'selected-id' },
  };

  beforeEach(async () => {
    await createTestbedModule({
      declarations: { TypeaheadInputComponent, SimpleInputComponent, GroupFieldComponent,
        RepeatableComponent, RepeatableElementLayoutComponent, ValidationSummaryFieldComponent },
      imports: { TypeaheadModule: TypeaheadModule.forRoot() },
    });
  });

  function group(requireSelection = true): GroupFormComponentDefinitionFrame {
    return {
      name: 'person', model: { class: 'GroupModel', config: { value: saved } },
      component: { class: 'GroupComponent', config: { componentDefinitions: [
        { name: 'name', model: { class: 'TypeaheadInputModel', config: {} },
          component: { class: 'TypeaheadInputComponent', config: {
            sourceType: 'static', staticOptions: [option], requireSelection,
          } }, layout: { class: 'DefaultLayout', config: { label: 'Name' } } },
        { name: 'email', model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
          component: { class: 'SimpleInputComponent', config: { onItemSelect: { rawPath: 'metadata.email' } } },
          layout: { class: 'DefaultLayout', config: { label: 'Email' } } },
        { name: 'identity', model: { class: 'SimpleInputModel', config: {} },
          component: { class: 'SimpleInputComponent', config: { onItemSelect: { rawPath: 'ID', clearValue: '' } } } },
        { name: 'notes', model: { class: 'SimpleInputModel', config: {} }, component: { class: 'SimpleInputComponent' } },
      ] } },
    };
  }

  async function mount(requireSelection = true, repeatable = false, hydrated = true) {
    const person = group(requireSelection);
    if (!hydrated) person.model = { class: 'GroupModel', config: {} };
    const config: FormConfigFrame = { name: 'lookup-dependents', componentDefinitions: [
      repeatable ? {
        name: 'people', model: { class: 'RepeatableModel', config: { value: [saved, { ...saved, name: 'Other Person' }] } },
        component: { class: 'RepeatableComponent', config: { canSort: true, elementTemplate: {
          ...person, name: '', layout: { class: 'RepeatableElementLayout' },
        } } },
      } : person,
      { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
    ] };
    const result = await createFormAndWaitForReady(config, { editMode: true, oid: 'lookup-harness', recordType: 'rdmp', formName: 'lookup-dependents', downloadAndCreateOnInit: false });
    const lookups = result.fixture.debugElement.queryAll(By.directive(TypeaheadInputComponent))
      .map(entry => entry.componentInstance as TypeaheadInputComponent);
    const settle = async () => { result.fixture.detectChanges(); await result.fixture.whenStable(); result.fixture.detectChanges(); };
    const select = async (item = option, row = 0) => { lookups[row].onSelect(new TypeaheadMatch(item, item.label)); await settle(); };
    const type = async (text: string, row = 0) => { lookups[row].displayControl.setValue(text); await settle(); };
    const value = () => result.formComponent.form!.getRawValue();
    return { ...result, lookups, settle, select, type, value };
  }

  it('leaves hydrated and manual siblings pristine during initialization and discarded provisional typing', async () => {
    const h = await mount();
    expect(h.value().person).toEqual(saved);
    expect(h.formComponent.form!.pristine).toBeTrue();
    await h.type('unmatched');
    expect(h.value().person).toEqual(saved);
    h.lookups[0].onBlur(); await h.settle();
    expect(h.lookups[0].displayControl.value).toBe(saved.name);
    expect(h.value().person).toEqual(saved);
  });

  it('preserves a fresh confirmed selection through typing and blur, then replaces only mapped siblings', async () => {
    const h = await mount(true, false, false);
    await h.select();
    await h.type('discard me');
    h.lookups[0].onBlur(); await h.settle();
    expect(h.value().person.email).toBe('selected@example.edu');
    expect(h.value().person.identity).toBe('selected-id');
    expect(h.value().person.name).toBe(option.value);
    h.formComponent.form!.get('person.notes')!.setValue('Keep manual value');
    await h.select({ label: 'Replacement', value: 'Replacement', raw: { metadata: { email: 'replacement@example.edu' } } });
    expect(h.value().person).toEqual({ name: 'Replacement', email: 'replacement@example.edu', identity: '', notes: 'Keep manual value' });
  });

  for (const hydrated of [true, false]) {
    it(`clears ${hydrated ? 'hydrated' : 'newly selected'} values before blur and refreshes required errors`, async () => {
      const h = await mount();
      if (!hydrated) await h.select();
      expect(h.fixture.nativeElement.querySelector('.validation-summary [data-validation-error-class="required"]')).toBeNull();
      await h.type('');
      expect(h.value().person).toEqual({ name: null, email: null, identity: '', notes: saved.notes });
      expect(h.formComponent.form!.get('person.email')!.hasError('required')).toBeTrue();
      expect(h.formComponent.form!.get('person.email')!.touched).toBeTrue();
      expect(h.fixture.nativeElement.querySelector('.validation-summary [data-validation-error-class="required"]')).not.toBeNull();
      h.lookups[0].onBlur(); await h.settle();
      expect(h.lookups[0].displayControl.value).toBe('');
      await h.select();
      expect(h.fixture.nativeElement.querySelector('.validation-summary [data-validation-error-class="required"]')).toBeNull();
    });
  }

  it('treats whitespace as an explicit clear', async () => {
    const h = await mount(); await h.type('   '); h.lookups[0].onBlur(); await h.settle();
    expect(h.value().person.email).toBeNull(); expect(h.value().person.name).toBeNull();
  });

  it('allows configured free text, preserves hydrated manual data, and releases a fresh selection when edited', async () => {
    const h = await mount(false);
    await h.type('Manual Person'); h.lookups[0].onBlur(); await h.settle();
    expect(h.value().person).toEqual({ ...saved, name: 'Manual Person' });
    await h.select(); await h.type('New free text'); h.lookups[0].onBlur(); await h.settle();
    expect(h.value().person).toEqual({ name: 'New free text', email: null, identity: '', notes: saved.notes });
    h.formComponent.form!.get('person.email')!.setValue('manual@example.edu');
    await h.type('More free text'); h.lookups[0].onBlur(); await h.settle();
    expect(h.value().person.email).toBe('manual@example.edu');
    await h.type(''); expect(h.value().person.email).toBeNull();
  });

  it('isolates selection and clear events to their repeatable row', async () => {
    const h = await mount(true, true);
    const other = h.value().people[1];
    await h.select(); await h.type('provisional'); h.lookups[0].onBlur(); await h.settle();
    expect(h.value().people[0].email).toBe('selected@example.edu');
    await h.type('');
    expect(h.value().people[0].email).toBeNull(); expect(h.value().people[1]).toEqual(other);
  });

  it('does not publish selection events during model hydration or disabled-state synchronization', async () => {
    const h = await mount();
    const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish').and.callThrough();
    h.formComponent.form!.get('person')!.disable(); await h.settle();
    h.formComponent.form!.get('person')!.enable(); await h.settle();
    expect(publish.calls.allArgs().filter(([event]) => event.type === 'field.item.selected')).toEqual([]);
    expect(h.value().person).toEqual(saved);
  });

  it('preserves hydrated manual siblings after resetting a previously selected free-text lookup', async () => {
    const h = await mount(false);
    await h.select();
    h.formComponent.form!.get('person')!.reset(saved);
    await h.settle();
    expect(h.formComponent.form!.pristine).toBeTrue();
    expect(h.formComponent.form!.untouched).toBeTrue();
    await h.type('Manually reloaded person');
    h.lookups[0].onBlur(); await h.settle();
    expect(h.value().person).toEqual({ ...saved, name: 'Manually reloaded person' });
  });

  it('cancels queued autofill when the group is programmatically reset', async () => {
    const h = await mount();
    h.lookups[0].onSelect(new TypeaheadMatch(option, option.label));
    h.fixture.detectChanges();
    h.formComponent.form!.get('person')!.reset(saved);
    await h.settle();
    expect(h.value().person).toEqual(saved);
    expect(h.formComponent.form!.pristine).toBeTrue();
    expect(h.formComponent.form!.untouched).toBeTrue();
  });

  it('keeps reset state when reset follows sibling writes before their async completion', async () => {
    const h = await mount();
    const reset = TestBed.inject(FormComponentEventBus).select$('field.item.selected')
      .subscribe(() => h.formComponent.form!.get('person')!.reset(saved));
    try {
      await h.select();
      expect(h.value().person).toEqual(saved);
      expect(h.formComponent.form!.pristine).toBeTrue();
      expect(h.formComponent.form!.untouched).toBeTrue();
    } finally {
      reset.unsubscribe();
    }
  });

  it('ignores display changes while disabled, including dependent clears', async () => {
    const h = await mount();
    h.formComponent.form!.get('person')!.disable();
    await h.settle();
    await h.type('');
    expect(h.value().person).toEqual(saved);
    expect(h.formComponent.form!.pristine).toBeTrue();
    expect(h.formComponent.form!.untouched).toBeTrue();
  });

  it('ignores blur and late selection callbacks while the lookup is disabled', async () => {
    const h = await mount();
    h.formComponent.form!.get('person')!.disable();
    await h.settle();
    h.lookups[0].onBlur();
    h.lookups[0].onSelect(new TypeaheadMatch(option));
    await h.settle();
    expect(h.value().person).toEqual(saved);
    expect(h.formComponent.form!.pristine).toBeTrue();
    expect(h.formComponent.form!.untouched).toBeTrue();
  });

  it('publishes a hydrated clear made before the producer first renders', async () => {
    const h = await mount();
    const bus = jasmine.createSpyObj<FormComponentEventBus>('bus', ['publish']);
    const producer = TestBed.runInInjectionContext(() => new FormComponentItemSelectEventProducer(bus));
    producer.bind({ component: h.lookups[0], definition: h.lookups[0].formFieldCompMapEntry, injector: TestBed.inject(Injector) });
    h.lookups[0].displayControl.setValue('');
    await h.settle();
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenCalledWith(jasmine.objectContaining({ selectedItem: null }));
    producer.destroy();
  });

  it('preserves manual siblings after a silent programmatic reload', async () => {
    const h = await mount(false);
    await h.select();
    h.formComponent.form!.get('person')!.reset(saved, { emitEvent: false });
    await h.settle();
    expect(h.lookups[0].displayControl.value).toBe(saved.name);
    await h.type('Manual name after reload');
    h.lookups[0].onBlur(); await h.settle();
    expect(h.value().person).toEqual({ ...saved, name: 'Manual name after reload' });
  });

  it('uses only the final interaction when selections and clears coalesce', async () => {
    const h = await mount();
    h.lookups[0].onSelect(new TypeaheadMatch(option));
    h.lookups[0].displayControl.setValue('');
    await h.settle();
    expect(h.value().person).toEqual({ name: null, email: null, identity: '', notes: saved.notes });
    h.lookups[0].displayControl.setValue('');
    h.lookups[0].onSelect(new TypeaheadMatch(option));
    await h.settle();
    expect(h.value().person).toEqual({ name: option.value, email: 'selected@example.edu', identity: 'selected-id', notes: saved.notes });
  });

  it('keeps queued selections and clears in their row after reordering', async () => {
    const h = await mount(true, true);
    const untouched = h.value().people[0];
    h.lookups[1].onSelect(new TypeaheadMatch(option));
    h.fixture.detectChanges();
    const row: RepeatableElementLayoutComponent<unknown> = h.fixture.debugElement
      .queryAll(By.directive(RepeatableElementLayoutComponent))[1].componentInstance;
    row.moveUpFn!();
    await h.settle();
    expect(h.value().people[0].email).toBe('selected@example.edu');
    expect(h.value().people[1]).toEqual(untouched);
    await h.type('', 1);
    expect(h.value().people[0].email).toBeNull();
    expect(h.value().people[1]).toEqual(untouched);
  });

  it('cancels queued selection when its repeatable row is removed and keeps the surviving row in scope', async () => {
    const h = await mount(true, true);
    const other = h.value().people[1];
    h.lookups[0].onSelect(new TypeaheadMatch(option));
    h.fixture.detectChanges();
    const row: RepeatableElementLayoutComponent<unknown> = h.fixture.debugElement.query(By.directive(RepeatableElementLayoutComponent)).componentInstance;
    row.removeFn!();
    await h.settle();
    expect(h.value().people).toEqual([other]);
    const repeatable: RepeatableComponent = h.fixture.debugElement.query(By.directive(RepeatableComponent)).componentInstance;
    const appended = { ...saved, name: 'Appended person' };
    await repeatable.appendNewElement(appended);
    await h.settle();
    h.lookups[1].onSelect(new TypeaheadMatch(option));
    await h.settle();
    expect(h.value().people[0].email).toBe('selected@example.edu');
    expect(h.value().people[1]).toEqual(appended);
    h.lookups[1].displayControl.setValue('');
    await h.settle();
    expect(h.value().people[0].email).toBeNull();
    expect(h.value().people[1]).toEqual(appended);
  });
});
