import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { FormService } from '../form.service';
import { SimpleInputComponent } from './simple-input.component';
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { ValidationSummaryFieldComponent } from './validation-summary.component';

describe('Aggregate maximum-length form validation', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        SimpleInputComponent,
        GroupFieldComponent,
        RepeatableComponent,
        RepeatableElementLayoutComponent,
        ValidationSummaryFieldComponent,
      },
    });
  });

  it('revalidates nested object rows through the Angular validator construction path', () => {
    const row = (name: string) => new FormGroup({ person: new FormGroup({ name: new FormControl(name) }) });
    const control = new FormArray([row(' ab ')]);
    const service = TestBed.inject(FormService);
    service.setValidators(control, [{
      class: 'aggregateMaxLength',
      config: { maxLength: 6, valuePath: 'person.name', distinct: true },
    }]);
    expect(control.valid).toBeTrue();
    control.push(row('cd'));
    expect(control.valid).toBeTrue(); // 'ab, cd': exactly six characters
    control.at(1).get('person.name')!.setValue('cde');
    expect(control.errors?.['aggregateMaxLength'].params).toEqual({ requiredLength: 6, actualLength: 7 });
    control.at(1).get('person.name')!.setValue('ab');
    expect(control.valid).toBeTrue(); // deduplicates the normalized values
    control.push(row('cdef'));
    expect(control.invalid).toBeTrue();
    control.removeAt(2);
    expect(control.valid).toBeTrue();
  });

  it('updates field and summary errors when repeatable rows are edited, added and removed', async () => {
    const config: FormConfigFrame = {
      name: 'aggregate_length_test',
      componentDefinitions: [
        {
          name: 'names',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['ab'],
              validators: [{ class: 'aggregateMaxLength', config: { maxLength: 6 } }],
            },
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                model: { class: 'SimpleInputModel', config: { value: 'cd' } },
                component: { class: 'SimpleInputComponent' },
              },
            },
          },
          layout: { class: 'DefaultLayout', config: { label: 'Names' } },
        },
        { name: 'validation', component: { class: 'ValidationSummaryComponent' } },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(config);
    const element: HTMLElement = fixture.nativeElement;
    const repeatable = formComponent.componentDefArr[0].component as RepeatableComponent;
    const control = repeatable.model!.formControl!;
    const fieldError = () => element.querySelector('redbox-field-error-summary [data-validation-error-class="aggregateMaxLength"]');
    const summaryError = () => element.querySelector('.validation-summary-errors [data-validation-error-class="aggregateMaxLength"]');
    const edit = async (index: number, value: string) => {
      const input = element.querySelectorAll<HTMLInputElement>('input[type="text"]')[index];
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
    };

    expect(control.valid).toBeTrue();
    await edit(0, 'abcdefg');
    expect(control.errors?.['aggregateMaxLength'].params).toEqual({ requiredLength: 6, actualLength: 7 });
    expect(fieldError()).toBeTruthy();
    expect(summaryError()).toBeTruthy();
    await edit(0, 'ab');
    expect(control.valid).toBeTrue();
    expect(fieldError()).toBeNull();
    expect(summaryError()).toBeNull();

    await repeatable.appendNewElement();
    await fixture.whenStable();
    expect(control.valid).toBeTrue(); // 'ab, cd'
    await repeatable.appendNewElement();
    await fixture.whenStable();
    expect(control.errors?.['aggregateMaxLength'].params).toEqual({ requiredLength: 6, actualLength: 10 });
    expect(fieldError()).toBeTruthy();
    expect(summaryError()).toBeTruthy();

    element.querySelector<HTMLButtonElement>('.rb-form-repeatable-item__remove')!.click();
    await fixture.whenStable();
    expect(control.valid).toBeTrue(); // 'cd, cd'
    expect(fieldError()).toBeNull();
    expect(summaryError()).toBeNull();
  });
});
