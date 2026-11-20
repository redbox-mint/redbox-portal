import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TypeaheadMatch, TypeaheadModule } from 'ngx-bootstrap/typeahead';
import { FormConfigFrame, jsonataEvaluateFunc, TypeaheadOption } from '@researchdatabox/sails-ng-common';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { GroupFieldComponent } from './component/group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './component/repeatable.component';
import { SimpleInputComponent } from './component/simple-input.component';
import { TabComponent, TabContentComponent } from './component/tab.component';
import { TypeaheadInputComponent } from './component/typeahead-input.component';
import { ValidationSummaryFieldComponent } from './component/validation-summary.component';
import { createFormValidationGroupsChangeRequestEvent, FormComponentEventBus, FormComponentEventType } from './form-state';

describe('Root form validation', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: {
      GroupFieldComponent, RepeatableComponent, RepeatableElementLayoutComponent,
      SimpleInputComponent, TabComponent, TabContentComponent, TypeaheadInputComponent, ValidationSummaryFieldComponent,
    }, imports: { TypeaheadModule: TypeaheadModule } });
  });

  const alice = { name: 'Alice Staffer', email: 'alice.staff@example.edu' };
  const bob = { name: 'Bob Adminson', email: 'bob.admin@example.edu' };
  const targetField = { dataModel: ['contributor_ci'] };
  const staffMessage = 'The CI must be a staff member';
  const distinctMessage = 'The CI and RDMP administrator must be different people';
  const aliceOption: TypeaheadOption = { label: alice.name, value: alice.name, raw: alice };

  async function mount() {
    const expressions = [
      '$substringAfter(**.contributor_ci.email, "@") != "student.example.edu"',
      '($ci := **.contributor_ci.email; $admins := **.contributor_dmp_administrators; ' +
        '$not($count($filter($admins, function($admin) {$admin.email = $ci})) > 0))',
    ];
    const personFields = [
      {
        name: 'name',
        model: { class: 'TypeaheadInputModel' as const },
        component: { class: 'TypeaheadInputComponent' as const, config: {
          sourceType: 'static' as const, requireSelection: true, staticOptions: [aliceOption],
        } },
      },
      {
        name: 'email',
        model: { class: 'SimpleInputModel' as const },
        component: { class: 'SimpleInputComponent' as const, config: { onItemSelect: { rawPath: 'email' } } },
      },
    ];
    const config: FormConfigFrame = {
      name: 'nested-rdmp-validation',
      type: 'rdmp',
      enabledValidationGroups: ['all'],
      validationGroups: {
        all: { description: 'Full validation', initialMembership: 'all' },
        draft: { description: 'Draft validation', initialMembership: 'none' },
      },
      validators: [staffMessage, distinctMessage].map((message, index) => ({
        class: 'jsonata-expression', message, targetField, config: { expression: expressions[index] },
      })),
      componentDefinitions: [
        {
          name: 'tabs',
          layout: { class: 'TabLayout' },
          component: { class: 'TabComponent', config: { tabs: [
            {
              name: 'people',
              layout: { class: 'TabContentLayout', config: { buttonLabel: 'People' } },
              component: { class: 'TabContentComponent', config: { componentDefinitions: [
                {
                  name: 'contributor_ci',
                  model: { class: 'GroupModel', config: { value: alice } },
                  component: { class: 'GroupComponent', config: { componentDefinitions: personFields } },
                  layout: { class: 'DefaultLayout' },
                },
                {
                  name: 'contributor_dmp_administrators',
                  model: { class: 'RepeatableModel', config: { value: [alice, bob] } },
                  component: { class: 'RepeatableComponent', config: {
                    elementTemplate: {
                      name: '',
                      model: { class: 'GroupModel' },
                      component: { class: 'GroupComponent', config: { componentDefinitions: personFields } },
                      layout: { class: 'RepeatableElementLayout' },
                    },
                  } },
                },
              ] } },
            },
          ] } },
        },
        {
          name: 'unrelated_required',
          model: { class: 'SimpleInputModel', config: { value: '', validators: [{ class: 'required' }] } },
          component: { class: 'SimpleInputComponent' },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
      ],
    };

    const evaluate = jasmine.createSpy('compiled validator').and.callFake(
      (_key: string, path: (number | string)[], value: unknown) => jsonataEvaluateFunc(expressions[Number(path[1])])(value),
    );
    const { fixture, formComponent } = await createFormAndWaitForReady(config, { editMode: true }, undefined, {
      entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp',
        callable: evaluate,
      }],
    });
    const form = formComponent.form!;
    const root: HTMLElement = fixture.nativeElement;
    const bus = TestBed.inject(FormComponentEventBus);
    const waitForValidation = async () => {
      if (formComponent.dataStatus.pending) {
        await firstValueFrom(bus.select$(FormComponentEventType.FORM_VALIDATION_BROADCAST).pipe(
          filter(event => event.status?.pending === false), timeout({ first: 2000 }),
        ));
      }
      await fixture.whenStable();
    };
    const rootMessages = () => Object.values(form.errors ?? {}).map(error => error.message);
    await waitForValidation();
    return { fixture, formComponent, form, root, waitForValidation, rootMessages, evaluate };
  }

  it('checks the CI and repeatable administrators even when a separate required field is empty', async () => {
    const { formComponent, form, root, waitForValidation, rootMessages, evaluate } = await mount();
    const update = spyOn(formComponent.recordService, 'update');

    expect(form.value.contributor_ci).toEqual(alice);
    expect(form.value.contributor_dmp_administrators).toEqual([alice, bob]);
    expect(form.get('unrelated_required')!.hasError('required')).toBeTrue();
    expect(evaluate).toHaveBeenCalledWith(
      'validators__1__config__expression', ['validators', '1', 'config', 'expression'],
      jasmine.objectContaining({ contributor_ci: alice, contributor_dmp_administrators: [alice, bob] }),
      jasmine.anything(),
    );
    expect(rootMessages()).toEqual([distinctMessage]);
    expect(root.querySelector('.rb-form-field-error-summary')).toBeNull();

    await formComponent.saveForm({ force: true, enabledValidationGroups: ['all'] });
    await waitForValidation();
    expect(update).not.toHaveBeenCalled();
    expect(root.querySelector('.rb-form-field-error-summary')?.textContent).toContain(distinctMessage);
    expect(root.querySelector('.validation-summary')?.textContent).toContain(distinctMessage);
    expect(root.querySelector('.rb-form-group.is-invalid')).not.toBeNull();

    form.get(['contributor_dmp_administrators', 0, 'email'])!.setValue('other.admin@example.edu');
    await waitForValidation();
    expect(form.errors).toBeNull();
    expect(form.invalid).toBeTrue();

    const ciEmail = form.get(['contributor_ci', 'email'])!;
    ciEmail.setValue('student@student.example.edu', { emitEvent: false });
    formComponent.broadcastFormStatus();
    await waitForValidation();
    expect(rootMessages()).toEqual([staffMessage]);
    expect(root.querySelector('.rb-form-field-error-summary')).toBeNull();
  });

  it('reruns root async validators on explicit revalidation with unchanged data', async () => {
    const { fixture, formComponent, form, waitForValidation, rootMessages, evaluate } = await mount();
    const value = form.getRawValue();
    expect(rootMessages()).toEqual([distinctMessage]);

    evaluate.and.callFake(async () => true);
    evaluate.calls.reset();
    formComponent.broadcastFormStatus(false);
    await fixture.whenStable();
    expect(evaluate).not.toHaveBeenCalled();
    expect(rootMessages()).toEqual([distinctMessage]);

    form.updateValueAndValidity({ emitEvent: false });
    expect(formComponent.dataStatus.pending).toBeTrue();
    await waitForValidation();

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(rootMessages()).toEqual([]);
    expect(form.getRawValue()).toEqual(value);
    expect(form.pristine).toBeTrue();
  });

  it('reevaluates newly enabled root validators after switching groups with unchanged data', async () => {
    const { formComponent, form, waitForValidation, rootMessages, evaluate } = await mount();
    const value = form.getRawValue();
    const bus = TestBed.inject(FormComponentEventBus);
    expect(rootMessages()).toEqual([distinctMessage]);

    evaluate.and.callFake(async (_key, path) => path[1] !== '0');
    evaluate.calls.reset();
    bus.publish(createFormValidationGroupsChangeRequestEvent({ initial: 'none', groups: { include: ['draft'] } }));
    await waitForValidation();
    expect(formComponent.enabledValidationGroups).toEqual(['draft']);
    expect(rootMessages()).toEqual([]);
    expect(evaluate).not.toHaveBeenCalled();

    bus.publish(createFormValidationGroupsChangeRequestEvent({ initial: 'none', groups: { include: ['all'] } }));
    expect(formComponent.dataStatus.pending).toBeTrue();
    await waitForValidation();

    expect(formComponent.enabledValidationGroups).toEqual(['all']);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(rootMessages()).toEqual([staffMessage]);
    expect(form.getRawValue()).toEqual(value);
    expect(form.pristine).toBeTrue();
  });

  it('reveals a targeted root error after blurring the saved CI name and as administrators change', async () => {
    const { fixture, formComponent, form, root, waitForValidation, rootMessages } = await mount();
    const ci = form.get('contributor_ci')!;
    const ciEntry = formComponent.getComponentDefByName(targetField);
    expect(ciEntry?.model?.formControl).toBe(ci);
    const ciGroup = root.querySelector<HTMLElement>('.rb-form-group')!;
    const ciName = ciGroup.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    const inlineError = () => root.querySelector('.rb-form-field-error-summary');
    const summary = () => root.querySelector('.validation-summary')?.textContent ?? '';

    expect(ci.untouched).toBeTrue();
    expect(rootMessages()).toEqual([distinctMessage]);
    expect(inlineError()).toBeNull();
    expect(ciGroup.classList.contains('is-invalid')).toBeFalse();
    expect(summary()).not.toContain(distinctMessage);

    ciName.dispatchEvent(new Event('focus'));
    ciName.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(ciName.classList.contains('ng-touched')).toBeTrue();
    expect(ci.get('name')?.touched).toBeTrue();
    expect(ci.touched).toBeTrue();
    expect(ci.pristine).toBeTrue();
    expect(ci.value).toEqual(alice);
    expect(inlineError()?.textContent).toContain(distinctMessage);
    expect(ciGroup.classList.contains('is-invalid')).toBeTrue();
    expect(summary()).toContain(distinctMessage);

    root.querySelector<HTMLButtonElement>('.rb-form-repeatable-item__remove')!.click();
    await waitForValidation();
    expect(form.value.contributor_dmp_administrators).toEqual([bob]);
    expect(inlineError()).toBeNull();
    expect(ciGroup.classList.contains('is-invalid')).toBeFalse();
    expect(summary()).not.toContain(distinctMessage);

    root.querySelector<HTMLButtonElement>('.rb-form-repeatable__add')!.click();
    await waitForValidation();
    const lookups = fixture.debugElement.queryAll(By.directive(TypeaheadInputComponent));
    const addedLookup = lookups.at(-1)!.query(By.css('input[role="combobox"]'));
    addedLookup.triggerEventHandler('typeaheadOnSelect', new TypeaheadMatch(aliceOption, aliceOption.label));
    await waitForValidation();

    expect(form.value.contributor_dmp_administrators).toEqual([bob, alice]);
    expect(rootMessages()).toEqual([distinctMessage]);
    expect(inlineError()?.textContent).toContain(distinctMessage);
    expect(ciGroup.classList.contains('is-invalid')).toBeTrue();
    expect(summary()).toContain(distinctMessage);
  });
});
