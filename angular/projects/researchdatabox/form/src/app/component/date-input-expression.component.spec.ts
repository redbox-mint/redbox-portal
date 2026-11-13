import { TestBed } from '@angular/core/testing';
import { FormComponentEventBus, createFormValidationGroupsChangeRequestEvent } from '../form-state';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { FormConfigFrame, jsonataEvaluateFunc } from '@researchdatabox/sails-ng-common';
import { DateInputComponent } from './date-input.component';
import { TabComponent, TabComponentLayout, TabContentComponent } from './tab.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';

const startBoundTemplate = 'formData.startDate != null and formData.startDate != "" ? formData.startDate : null';

describe('Date bounds through nested field expressions', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: { DateInputComponent, TabComponent, TabComponentLayout, TabContentComponent },
      imports: { BsDatepickerModule: BsDatepickerModule.forRoot(), NoopAnimationsModule },
    });
  });

  async function createRange(startDate: string | null, endDate: string | null, bound = 'minDate') {
    const evaluate = jsonataEvaluateFunc(startBoundTemplate);
    const contexts: unknown[] = [];
    const config: FormConfigFrame = {
      name: 'nested-date-range',
      validationGroups: { none: { description: '', initialMembership: 'none' }, dateRequired: { description: '' } },
      enabledValidationGroups: ['none'],
      componentDefinitions: [{ name: 'mainTab', component: { class: 'TabComponent', config: { tabs: [{
        name: 'coverage', layout: { class: 'TabContentLayout', config: { buttonLabel: 'Coverage' } },
        component: { class: 'TabContentComponent', config: { selected: true, componentDefinitions: [
          { name: 'startDate', model: { class: 'DateInputModel', config: { dateOnly: true, value: startDate } },
            component: { class: 'DateInputComponent', config: { dateFormat: 'YYYY/MM/DD' } } },
          { name: 'endDate', model: { class: 'DateInputModel', config: { dateOnly: true, value: endDate,
              validators: [{ class: 'required', groups: { include: ['dateRequired'] } }] } },
            component: { class: 'DateInputComponent', config: { dateFormat: 'YYYY/MM/DD' } },
            expressions: [{ name: 'endDate-start-bound', config: {
              conditionKind: 'jsonpointer', condition: '/mainTab/coverage/startDate::field.value.changed',
              target: `component.bsFullConfig.${bound}`, hasTemplate: true,
              template: startBoundTemplate, runOnFormReady: true,
            } }] },
        ] } },
      }] } }, layout: { class: 'TabLayout' } }],
    };
    const result = await createFormAndWaitForReady(config, undefined, undefined, { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/',
      callable: (_keyString, key, context) => {
        expect(key.at(-1)).toBe('template');
        contexts.push(structuredClone(context));
        return evaluate(context);
      },
    }] });
    const dates = result.fixture.debugElement.queryAll(By.directive(DateInputComponent))
      .map(element => element.componentInstance as DateInputComponent);
    const inputs = Array.from((result.fixture.nativeElement as HTMLElement).querySelectorAll('input'));
    async function settle() {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      await result.fixture.whenStable();
      result.fixture.detectChanges();
    }
    async function type(index: number, value: string) {
      inputs[index].value = value;
      inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[index].dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      await settle();
    }
    await settle();
    return { ...result, dates, contexts, inputs, settle, type };
  }

  it('dispatches native Start changes to the End picker and rejects typed reverse dates', async () => {
    const { dates: [start, end], fixture, formComponent, type, settle, contexts } = await createRange(null, '2026-01-11');
    expect(end.datepicker.minDate).toBeUndefined();
    await type(0, '2026/01/10');
    expect(start.formControl.value).toBe('2026-01-10');
    expect(end.datepicker.minDate).toEqual(new Date(2026, 0, 10));
    expect(contexts).toContain(jasmine.objectContaining({ formData: { startDate: '2026-01-10', endDate: '2026-01-11' } }));
    end.datepicker.show();
    await settle();
    const ninth = Array.from(document.querySelectorAll('bs-datepicker-container .bs-datepicker-body span'))
      .find(element => element.textContent?.trim() === '9' && element.classList.contains('disabled'));
    expect(ninth).toBeDefined();
    end.datepicker.hide();
    await type(1, '2026/01/09');
    expect(end.formControl.value === '2026-01-09' && end.formControl.valid).toBeFalse();
    await type(1, '2026/01/10');
    expect(end.formControl.value).toBe('2026-01-10');
    expect(end.formControl.valid).toBeTrue();
    expect(formComponent.form?.valid).toBeTrue();
    fixture.destroy();
  });

  it('validates saved reverse dates on ready, then revalidates and clears bounds from Start events', async () => {
    const { dates: [start, end], formComponent, type } = await createRange('2026-01-10', '2026-01-09');
    expect(end.formControl.value).toBe('2026-01-09');
    expect(end.formControl.hasError('dateMin')).toBeTrue();
    expect(formComponent.form?.invalid).toBeTrue();
    expect(start.formControl.pristine && end.formControl.pristine).toBeTrue();
    const bus = TestBed.inject(FormComponentEventBus);
    bus.publish(createFormValidationGroupsChangeRequestEvent({ initial: 'current', groups: { include: ['dateRequired'] } }));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(formComponent.enabledValidationGroups).toContain('dateRequired');
    expect(end.formControl.hasError('dateMin')).toBeTrue();
    await type(0, '2026/01/08');
    expect(end.formControl.valid).toBeTrue();
    await type(0, '2026/01/12');
    expect(end.formControl.hasError('dateMin')).toBeTrue();
    expect(end.formControl.value).toBe('2026-01-09');
    await type(0, '');
    expect(start.formControl.value).toBeNull();
    expect(end.datepicker.minDate).toBeUndefined();
    expect(end.formControl.valid).toBeTrue();
    expect(end.formControl.value).toBe('2026-01-09');
    expect(end.formControl.pristine).toBeTrue();
  });
  it('updates expression-driven maximum bounds on ready, changes, and clearing', async () => {
    const { dates: [, end], type } = await createRange('2026-01-10', '2026-01-11', 'maxDate');
    expect(end.datepicker.maxDate).toEqual(new Date(2026, 0, 10));
    expect(end.formControl.hasError('dateMax')).toBeTrue();
    await type(0, '2026/01/12');
    expect(end.formControl.valid).toBeTrue();
    await type(0, '2026/01/09');
    expect(end.formControl.hasError('dateMax')).toBeTrue();
    await type(0, '');
    expect(end.datepicker.maxDate).toBeUndefined();
    expect(end.formControl.valid).toBeTrue();
    expect(end.formControl.value).toBe('2026-01-11');
    expect(end.formControl.pristine).toBeTrue();
  });

  it('notifies nested status subscribers after expression bounds settle without changing End or retriggering expressions', async () => {
    const { dates: [, end], formComponent, type, contexts, settle } = await createRange('2026-01-08', '2026-01-09');
    const statuses: string[] = [];
    const nestedStatuses: string[] = [];
    const formStatuses: string[] = [];
    const subscriptions = [
      end.formControl.statusChanges.subscribe(status => statuses.push(status)),
      end.formControl.parent!.statusChanges.subscribe(status => nestedStatuses.push(status)),
      formComponent.form!.statusChanges.subscribe(status => formStatuses.push(status)),
    ];
    for (const [text, status] of [['2026/01/10', 'INVALID'], ['2026/01/08', 'VALID'],
      ['2026/01/12', 'INVALID'], ['', 'VALID']]) {
      await type(0, text);
      expect(statuses.at(-1)).toBe(status);
      expect(nestedStatuses.at(-1)).toBe(status);
      expect(formStatuses.at(-1)).toBe(status);
      expect(end.formControl.value).toBe('2026-01-09');
      expect(end.formControl.pristine && end.formControl.untouched).toBeTrue();
      const counts = [statuses.length, nestedStatuses.length, formStatuses.length, contexts.length];
      await settle();
      expect([statuses.length, nestedStatuses.length, formStatuses.length, contexts.length]).toEqual(counts);
    }
    expect(statuses).toEqual(['INVALID', 'VALID', 'INVALID', 'VALID']);
    subscriptions.forEach(subscription => subscription.unsubscribe());
  });

});
