import { fakeAsync, TestBed, tick } from '@angular/core/testing';
// Load the form registry before a component that the registry itself imports.
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { ValidationSummaryFieldComponent } from "./validation-summary.component";
import { FormConfigFrame, TabFieldComponentConfigFrame, ValidationSummaryFieldComponentConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from "./simple-input.component";
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { TabComponent } from './tab.component';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FormComponentEventType } from '../form-state/events/form-component-event.types';
import { RecordActionResult, TranslationService } from '@researchdatabox/portal-ng-common';

describe('ValidationSummaryFieldComponent', () => {
  let translationService: { translationMap: Record<string, string>; t: (key: string) => string };

  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "ValidationSummaryFieldComponent": ValidationSummaryFieldComponent,
        "SimpleInputComponent": SimpleInputComponent,
        "GroupFieldComponent": GroupFieldComponent,
        "RepeatableComponent": RepeatableComponent,
        "RepeatableElementLayoutComponent": RepeatableElementLayoutComponent,
      }
    });

    translationService = TestBed.inject(TranslationService as any);
    translationService.translationMap = translationService.translationMap || {};
    translationService.translationMap['@dmpt-form-validation-summary-valid'] = 'The form is valid.';
    spyOn(translationService, 't').and.callFake((key: string) => translationService.translationMap[key] ?? key);
  });
  async function createFormWithTouchedControls(config: FormConfigFrame) {
    const result = await createFormAndWaitForReady(config, { editMode: true });
    result.formComponent.form!.markAllAsTouched();
    await result.fixture.whenStable();
    return result;
  }

  it('shows scoped draft and full-save failures inline and in the summary', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'scoped-save-errors',
      enabledValidationGroups: ['all', 'conditional'],
      validationGroups: {
        all: { description: '', initialMembership: 'all' },
        conditional: { description: '', initialMembership: 'none' },
        'draft-minimum': { description: '', initialMembership: 'none' },
      },
      validators: [
        {
          class: 'different-values',
          config: { controlNames: ['title', 'later'] },
          targetField: { angularComponents: ['title'] },
          message: 'Full cross-field error',
        },
      ],
      componentDefinitions: [
        {
          name: 'title',
          component: { class: 'SimpleInputComponent' },
          layout: { class: 'DefaultLayout' },
          model: { class: 'SimpleInputModel', config: {
            value: '', validators: [{ class: 'required', groups: { include: ['draft-minimum'] } }],
          } },
        },
        {
          name: 'later',
          component: { class: 'SimpleInputComponent' },
          layout: { class: 'DefaultLayout' },
          model: { class: 'SimpleInputModel', config: {
            value: '', validators: [{ class: 'required', groups: { include: ['conditional'], exclude: ['all'] } }],
          } },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
      ],
    }, { editMode: true });
    const form = formComponent.form!;
    const summary = formComponent.componentDefArr[2].component as ValidationSummaryFieldComponent;
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo(RecordActionResult.fromResponse({
      success: true, outcome: 'saved', message: '', oid: formComponent.trimmedParams.oid(),
    }));
    const root: HTMLElement = fixture.nativeElement;
    const inlineErrors = () => root.querySelectorAll('.rb-form-field-error-summary');
    const laterInput = root.querySelectorAll('input')[1];
    const laterControl = form.get('later')!;
    const draft = { force: true, enabledValidationGroups: ['draft-minimum'] };

    expect(form.invalid).toBeTrue();
    expect(await summary.allValidationErrorsDisplay()).toEqual([]);
    expect(inlineErrors().length).toBe(0);

    await formComponent.saveForm(draft);
    await fixture.whenStable();
    expect(update).not.toHaveBeenCalled();
    expect(form.untouched).toBeTrue();
    expect((await summary.allValidationErrorsDisplay()).map(entry => entry.lineagePaths.angularComponents)).toEqual([['title']]);
    expect(inlineErrors().length).toBe(1);

    expect(formComponent.enabledValidationGroups).toEqual(['all', 'conditional']);
    expect(form.hasError('different-values')).toBeTrue();
    expect((await summary.allValidationErrorsDisplay())[0].errors.map(error => error.class)).toEqual(['required']);

    // Blur the untouched full-set field without changing its value.
    const failedDraftValues = form.getRawValue();
    expect(laterControl.untouched).toBeTrue();
    laterInput.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(laterControl.touched).toBeTrue();
    expect(form.getRawValue()).toEqual(failedDraftValues);
    expect((await summary.allValidationErrorsDisplay()).map(entry => entry.lineagePaths.angularComponents))
      .toEqual([['title'], ['later']]);
    expect(inlineErrors().length).toBe(2);
    laterControl.markAsUntouched();

    form.get('title')!.setValue('Draft title');
    await formComponent.saveForm(draft);
    await fixture.whenStable();
    expect(update).toHaveBeenCalledTimes(1);
    expect(await summary.allValidationErrorsDisplay()).toEqual([]);
    expect(inlineErrors().length).toBe(0);

    const savedDraftValues = form.getRawValue();
    expect(laterControl.untouched).toBeTrue();
    laterInput.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(laterControl.touched).toBeTrue();
    expect(form.getRawValue()).toEqual(savedDraftValues);
    expect((await summary.allValidationErrorsDisplay()).map(entry => entry.lineagePaths.angularComponents)).toEqual([['later']]);
    expect(inlineErrors().length).toBe(1);
    laterControl.markAsUntouched();

    form.get('title')!.setValue('');
    await formComponent.saveForm({ force: true, enabledValidationGroups: ['all', 'conditional'] });
    await fixture.whenStable();
    expect(update).toHaveBeenCalledTimes(1);
    expect((await summary.allValidationErrorsDisplay()).map(entry => entry.errors.map(error => error.class)))
      .toEqual([['required', 'different-values'], ['required']]);
    expect(inlineErrors().length).toBe(2);
    inlineErrors()[0].querySelector<HTMLButtonElement>('.rb-form-field-error-toggle')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.rb-form-field-error-panel')?.textContent).toContain('Full cross-field error');
  });

  it('keeps a draft-only field error after a sibling edit and discards a root error', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'draft-error-lifetime',
      enabledValidationGroups: ['all'],
      validationGroups: {
        all: { description: '', initialMembership: 'all' },
        'draft-minimum': { description: '', initialMembership: 'none' },
      },
      validators: [{
        class: 'different-values',
        config: { controlNames: ['title', 'notes'] },
        groups: { include: ['draft-minimum'], exclude: ['all'] },
        message: 'Title and notes must differ',
        targetField: { dataModel: ['title'] },
      }],
      componentDefinitions: [
        {
          name: 'title',
          component: { class: 'SimpleInputComponent' },
          layout: { class: 'DefaultLayout' },
          model: { class: 'SimpleInputModel', config: {
            value: '   ',
            validators: [{
              class: 'pattern',
              config: { pattern: '.*\\S.*', description: 'Non-blank title' },
              groups: { include: ['draft-minimum'], exclude: ['all'] },
              message: 'Enter a title',
            }],
          } },
        },
        {
          name: 'notes',
          component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { value: '   ' } },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
      ],
    }, { editMode: true });
    const root: HTMLElement = fixture.nativeElement;
    const form = formComponent.form!;
    const title = form.get('title')!;
    const titleInput = root.querySelector('input')!;
    const summary = () => root.querySelector('.validation-summary')?.textContent ?? '';
    const inline = () => root.querySelector('.rb-form-field-error-summary')?.textContent ?? '';
    const update = spyOn(formComponent.recordService, 'update');

    await formComponent.saveForm({ force: true, enabledValidationGroups: ['draft-minimum'] });
    await fixture.whenStable();
    expect(update).not.toHaveBeenCalled();
    expect(form.valid).toBeTrue();
    expect(title.untouched).toBeTrue();
    expect(summary()).toContain('Enter a title');
    expect(summary()).toContain('Title and notes must differ');

    form.get('notes')!.setValue('Updated notes');
    await fixture.whenStable();
    expect(title.value).toBe('   ');
    expect(title.untouched).toBeTrue();
    expect(summary()).toContain('Enter a title');
    expect(summary()).not.toContain('Title and notes must differ');
    expect(inline()).toContain('Enter a title');
    expect(titleInput.classList.contains('is-invalid')).toBeTrue();

    title.setValue('Draft title');
    await fixture.whenStable();
    expect(root.querySelector('.validation-summary')).toBeNull();
    expect(root.querySelector('.rb-form-field-error-summary')).toBeNull();
    expect(titleInput.classList.contains('is-invalid')).toBeFalse();
  });

  it('keeps server save errors visible when restored interactive validation settles', async () => {
    let evaluate = async () => true;
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'server-error-visibility',
      enabledValidationGroups: ['all'],
      validationGroups: {
        all: { description: '', initialMembership: 'all' },
        'draft-minimum': { description: '', initialMembership: 'none' },
      },
      validators: [{ class: 'jsonata-expression', config: {
        expression: 'true', evaluator: () => evaluate(),
      } }],
      componentDefinitions: [
        {
          name: 'title',
          component: { class: 'SimpleInputComponent' },
          layout: { class: 'DefaultLayout' },
          model: { class: 'SimpleInputModel', config: { value: 'Draft title' } },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
      ],
    }, { editMode: true });
    spyOn(formComponent.recordService, 'update').and.resolveTo(RecordActionResult.fromResponse({
      outcome: 'not-saved',
      problems: [{ kind: 'validation', phase: 'pre-save', issues: [
        { field: 'title', code: 'title-blocked', message: 'Server field error' },
        { code: 'save-blocked', message: 'Server form error' },
      ] }],
    }, 422));

    expect(formComponent.form!.get('title')!.untouched).toBeTrue();
    let finishValidation!: (valid: boolean) => void;
    evaluate = () => new Promise<boolean>(resolve => { finishValidation = resolve; });
    await formComponent.saveForm({ force: true, enabledValidationGroups: ['draft-minimum'] });
    expect(formComponent.enabledValidationGroups).toEqual(['all']);
    finishValidation(false);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await fixture.whenStable();
    expect(formComponent.form!.hasError('jsonata-expression')).toBeTrue();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.rb-form-field-error-summary')?.textContent).toContain('Server field error');
    expect(root.querySelector('.validation-summary')?.textContent).toContain('Server field error');
    expect(root.querySelector('.validation-summary')?.textContent).toContain('Server form error');
  });

  it('should create component', () => {
    let fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  describe('deferErrorsOnNewRecord', () => {
    async function createDeferredForm(
      config: ValidationSummaryFieldComponentConfigFrame = { deferErrorsOnNewRecord: true },
      props: { oid?: string } = { oid: '' },
      required = true,
    ) {
      return createFormAndWaitForReady({
        name: 'defer-new-record',
        componentDefinitions: [
          {
            name: 'title',
            model: { class: 'SimpleInputModel', config: { value: '', validators: required ? [{ class: 'required' }] : [] } },
            component: { class: 'SimpleInputComponent' },
            layout: { class: 'DefaultLayout', config: { label: 'Title' } },
          },
          {
            name: 'optional',
            model: { class: 'SimpleInputModel', config: { value: '' } },
            component: { class: 'SimpleInputComponent' },
          },
          {
            name: 'summary',
            component: { class: 'ValidationSummaryComponent', config },
          },
        ],
      }, { editMode: true, ...props });
    }

    function expectTitleError(root: HTMLElement): void {
      expect(root.querySelector('.validation-summary')).not.toBeNull();
      expect(root.querySelector('.validation-summary-item a')?.textContent).toBe('Title');
      expect(root.querySelector('[data-validation-error-class="required"]')).not.toBeNull();
    }

    it('T1: hides an untouched new record summary while retaining its validation errors', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      expect(formComponent.form!.pristine).toBeTrue();
      expect(formComponent.form!.untouched).toBeTrue();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      const summary = formComponent.componentDefArr[2].component as ValidationSummaryFieldComponent;
      const errors = await summary.allValidationErrorsDisplay();
      expect(errors).toEqual([]);
      expect(formComponent.getValidationErrors()[0].errors.some(error => error.class === 'required')).toBeTrue();
    });

    it('T2: reveals the required field after a control is touched without a value change', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });

    it('shows a field touched with onlySelf while the root remains untouched', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      formComponent.form!.get('title')!.markAsTouched({ onlySelf: true });
      await fixture.whenStable();
      expect(formComponent.form!.untouched).toBeTrue();
      expectTitleError(fixture.nativeElement);
    });

    it('T3: auto-population and editing an unrelated field do not reveal untouched errors', async () => {
      const { fixture, formComponent } = await createDeferredForm({ deferErrorsOnNewRecord: true, showWhenValid: true });
      const optional = formComponent.form!.get('optional')!;
      optional.setValue('Populated from RDMP');
      optional.markAsDirty();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      optional.markAsTouched();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });

    for (const eventType of [
      FormComponentEventType.FORM_SAVE_REQUESTED,
      FormComponentEventType.FORM_SAVE_FAILURE,
    ] as const) {
      it(`keeps errors hidden on ${eventType} until validation rejects the field`, async () => {
        const { fixture, formComponent } = await createDeferredForm();
        spyOn(formComponent, 'saveForm').and.resolveTo();
        TestBed.inject(FormComponentEventBus).publish({ type: eventType, formScopeId: formComponent.eventScopeId });
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      });
    }

    it('hides untouched errors on load for an existing record', async () => {
      const { fixture, formComponent } = await createDeferredForm({ deferErrorsOnNewRecord: true }, {});
      expect(formComponent.trimmedParams.oid()).not.toBe('');
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });

    it('hides untouched errors on a new record with no deferral configured', async () => {
      const { fixture } = await createDeferredForm({});
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
    });

    it('T8: defers the valid info box until a field is touched', async () => {
      const { fixture, formComponent } = await createDeferredForm({
        deferErrorsOnNewRecord: true, showWhenValid: true,
      }, { oid: '' }, false);
      expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.alert-info')?.textContent.trim()).toBe('The form is valid.');
    });

    it('shows the valid info box after an onlySelf touch and hides it after reset', async () => {
      const { fixture, formComponent } = await createDeferredForm({
        deferErrorsOnNewRecord: true, showWhenValid: true,
      }, { oid: '' }, false);
      const title = formComponent.form!.get('title')!;
      title.markAsTouched({ onlySelf: true });
      await fixture.whenStable();
      expect(formComponent.form!.untouched).toBeTrue();
      expect(fixture.nativeElement.querySelector('.alert-info')?.textContent.trim()).toBe('The form is valid.');
      title.markAsUntouched({ onlySelf: true });
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
    });

    it('reveals untargeted form errors after root touch without revealing untouched field errors', async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady({
        name: 'untargeted-validation',
        validators: [{ class: 'different-values', config: { controlNames: ['left', 'right'] } }],
        componentDefinitions: [
          ...['left', 'right', 'required'].map(name => ({
            name, model: { class: 'SimpleInputModel' as const, config: {
              value: '', validators: name === 'required' ? [{ class: 'required' }] : [],
            } }, component: { class: 'SimpleInputComponent' as const },
          })),
          { name: 'summary', component: { class: 'ValidationSummaryComponent', config: {
            deferErrorsOnNewRecord: true, showWhenValid: true,
          } } },
        ],
      }, { editMode: true, oid: '' });
      const summary = formComponent.componentDefArr[3].component as ValidationSummaryFieldComponent;
      expect(await summary.allValidationErrorsDisplay()).toEqual([]);
      const left = formComponent.form!.get('left')!;
      left.setValue('conflict');
      formComponent.form!.get('right')!.setValue('conflict');
      left.markAsTouched({ onlySelf: true });
      await fixture.whenStable();
      expect(formComponent.form!.untouched).toBeTrue();
      expect(await summary.allValidationErrorsDisplay()).toEqual([]);
      formComponent.form!.get('right')!.markAsTouched();
      await fixture.whenStable();
      const errors = await summary.allValidationErrorsDisplay();
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('@validator-error-form-level');
      expect(fixture.nativeElement.querySelectorAll('.validation-summary-item').length).toBe(1);
      expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
      formComponent.form!.get('right')!.setValue('different');
      await fixture.whenStable();
      expect(await summary.allValidationErrorsDisplay()).toEqual([]);
      expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
    });

    const deferredStateCases: Array<[ValidationSummaryFieldComponentConfigFrame, string, boolean]> = [
      [{ deferErrorsOnNewRecord: true, showWhenValid: true }, '', true],
      [{ deferErrorsOnNewRecord: true, showWhenValid: true }, 'existing-record', false],
      [{ showWhenValid: true }, '', false],
    ];
    for (const [config, oid, expected] of deferredStateCases) {
      it(`sets the deferred state to ${expected} before the first refresh (flag ${config.deferErrorsOnNewRecord === true}, oid '${oid}')`, () => {
        const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
        const component = fixture.componentInstance as any;
        spyOnProperty(component, 'formComponent', 'get').and.returnValue({
          trimmedParams: { oid: () => oid },
          form: undefined,
        });
        component.setPropertiesFromComponentMapEntry({
          compConfigJson: { name: 'summary', component: { class: 'ValidationSummaryComponent', config } },
        });
        expect(component.errorDisplayDeferred).toBe(expected);
      });
    }

    it('T9: clearing touch state hides field errors until a save is attempted', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
      formComponent.form!.markAsPristine();
      formComponent.form!.markAsUntouched();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
    });

    it('reveals all errors on a direct save without relying on a save-request event', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      await formComponent.saveForm({ force: true });
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });

    it('filters nested repeatable errors independently and clears only the corrected entry', async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady({
        name: 'publication-people',
        componentDefinitions: [
          {
            name: 'people', model: { class: 'RepeatableModel', config: { value: ['', ''] } },
            component: { class: 'RepeatableComponent', config: {
              elementTemplate: {
                name: '', model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
                component: { class: 'SimpleInputComponent' },
              },
            } },
          },
          { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { deferErrorsOnNewRecord: true } } },
        ],
      }, { editMode: true, oid: '' });
      const summary = formComponent.componentDefArr[1].component as ValidationSummaryFieldComponent;
      const first = formComponent.form!.get(['people', 0])!;
      const second = formComponent.form!.get(['people', 1])!;
      first.markAsDirty();
      await fixture.whenStable();
      expect(await summary.allValidationErrorsDisplay()).toEqual([]);
      first.markAsTouched();
      await fixture.whenStable();
      expect((await summary.allValidationErrorsDisplay()).length).toBe(1);
      second.markAsTouched();
      await fixture.whenStable();
      expect((await summary.allValidationErrorsDisplay()).length).toBe(2);
      first.setValue('Populated name');
      await fixture.whenStable();
      expect((await summary.allValidationErrorsDisplay()).length).toBe(1);

      // Refreshing many errors must not search the component tree per error.
      const lookup = spyOn(formComponent, 'getComponentDefByName').and.callThrough();
      await (summary as any).refreshValidationErrors();
      expect(lookup).not.toHaveBeenCalled();

      const repeatable = formComponent.componentDefArr[0].component as RepeatableComponent;
      await repeatable.replaceAllElements(['', '']);
      await fixture.whenStable();
      expect(await summary.allValidationErrorsDisplay()).toEqual([]);
      const replacement = formComponent.form!.get(['people', 1])!;
      expect(replacement).not.toBe(second);
      replacement.markAsTouched();
      await fixture.whenStable();
      expect((await summary.allValidationErrorsDisplay()).length).toBe(1);
    });

    it('keeps a touched repeatable error with its control after reordering', async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady({
        name: 'reordered-people',
        componentDefinitions: [
          {
            name: 'people', model: { class: 'RepeatableModel', config: { value: ['', ''] } },
            component: { class: 'RepeatableComponent', config: {
              canSort: true,
              elementTemplate: {
                name: '', model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
                component: { class: 'SimpleInputComponent' },
              },
            } },
          },
          { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { deferErrorsOnNewRecord: true } } },
        ],
      }, { editMode: true, oid: '' });
      const summary = formComponent.componentDefArr[1].component as ValidationSummaryFieldComponent;
      const repeatable = formComponent.componentDefArr[0].component as RepeatableComponent;
      const second = formComponent.form!.get(['people', 1])!;
      second.markAsTouched({ onlySelf: true });
      await fixture.whenStable();
      expect((await summary.allValidationErrorsDisplay())[0].lineagePaths?.angularComponents).toEqual(['people', '1']);
      repeatable.moveElementFn((repeatable as any).compDefMapEntries[1], -1)();
      await fixture.whenStable();
      expect(formComponent.form!.get(['people', 0])).toBe(second);
      const errors = await summary.allValidationErrorsDisplay();
      expect(errors.length).toBe(1);
      expect(errors[0].lineagePaths?.angularComponents).toEqual(['people', '0']);
      expect(fixture.nativeElement.querySelectorAll('.validation-summary-item').length).toBe(1);
    });

    for (const formLevel of [false, true]) {
      it(`filters ${formLevel ? 'form-targeted' : 'group-level'} errors by the group control touch state`, async () => {
        const validator = { class: 'different-values', config: { controlNames: ['left', 'right'] } };
        const { fixture, formComponent } = await createFormAndWaitForReady({
          name: 'group-validation',
          validators: formLevel ? [{
            class: 'different-values', config: { controlNames: ['pair.left', 'pair.right'] },
            targetField: { formConfig: ['componentDefinitions', 0] },
          }] : [],
          componentDefinitions: [
            {
              name: 'pair', model: { class: 'GroupModel', config: { validators: formLevel ? [] : [validator] } },
              component: { class: 'GroupComponent', config: { componentDefinitions: ['left', 'right'].map(name => ({
                name, model: { class: 'SimpleInputModel', config: { value: '' } },
                component: { class: 'SimpleInputComponent' },
              })) } },
            },
            { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { deferErrorsOnNewRecord: true } } },
          ],
        }, { editMode: true, oid: '' });
        const summary = formComponent.componentDefArr[1].component as ValidationSummaryFieldComponent;
        expect(formComponent.getValidationErrors().length).toBe(1);
        formComponent.form!.get(['pair', 'left'])!.markAsTouched({ onlySelf: true });
        await fixture.whenStable();
        expect(await summary.allValidationErrorsDisplay()).toEqual([]);
        // Normal child interaction touches the group; onlySelf deliberately does not.
        formComponent.form!.get(['pair', 'right'])!.markAsTouched();
        await fixture.whenStable();
        expect((await summary.allValidationErrorsDisplay()).length).toBe(1);
        expect(fixture.nativeElement.querySelector('.validation-summary')).not.toBeNull();
      });
    }

    it('hides untouched errors on load for a new record with the flag explicitly false', async () => {
      const { fixture } = await createDeferredForm({ deferErrorsOnNewRecord: false });
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
    });

    it('keeps untouched errors hidden after a new record receives its first saved oid', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      formComponent.oid.set('first-saved-record');
      formComponent.form!.updateValueAndValidity();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
    });
  });

  it('renders translated HTML labels as text inside the summary link, retaining raw metadata and error text', async () => {
    translationService.translationMap['@research-label'] = 'Research with <a href="https://example.org" target="_blank" rel="noopener">DFAT &amp; Australia&#39;s partners</a>?';
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'html-labels',
      componentDefinitions: [
        {
          name: 'research',
          model: { class: 'SimpleInputModel', config: { value: '', validators: [{ class: 'required' }] } },
          component: { class: 'SimpleInputComponent' },
          layout: { class: 'DefaultLayout', config: { label: '@research-label' } },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
      ],
    }, { editMode: true });
    const root: HTMLElement = fixture.nativeElement;
    formComponent.form!.markAllAsTouched();
    await fixture.whenStable();
    const link = root.querySelector('.validation-summary-item a');
    expect(link?.textContent).toBe("Research with DFAT & Australia's partners?");
    expect(link?.querySelector('a')).toBeNull();
    expect(link?.textContent).not.toContain('<a href');
    expect(link?.getAttribute('data-validation-summary-message')).toBe('@research-label');
    // The original field continues to render the linked label intentionally.
    expect(root.querySelector('.rb-form-field-label a')?.textContent).toBe("DFAT & Australia's partners");

    const summary = fixture.componentInstance.componentDefArr[1].component as ValidationSummaryFieldComponent;
    summary.validationErrorsDisplay$.next([{
      id: 'server-field', message: translationService.translationMap['@research-label'],
      errors: [{ class: 'server', message: 'Keep literal <value> &amp; text', params: {} }],
      lineagePaths: { formConfig: [], angularComponents: [], dataModel: [], layout: [] },
    }]);
    fixture.detectChanges();
    expect(root.querySelector('.validation-summary-item a')?.textContent).toBe("Research with DFAT & Australia's partners?");
    expect(root.querySelector('.validation-summary-errors li')?.textContent).toBe('Keep literal <value> &amp; text');
  });

  for (const source of ['form config', 'component entries']) {
    it(`converts tab, group and leaf lineage labels from ${source} before joining and deduplicating`, () => {
      const component = TestBed.createComponent(ValidationSummaryFieldComponent).componentInstance;
      const leaf = { name: 'field', component: { class: 'SimpleInputComponent' }, layout: { config: { label: '<a href="/field">Field &amp; partners</a>' } } };
      const group = { name: 'group', component: { class: 'GroupComponent', config: { componentDefinitions: [leaf] } }, layout: { config: { label: '<b>Group</b>' } } };
      const tab = { name: 'tab', component: { class: 'TabContentComponent', config: { componentDefinitions: [group] } }, layout: { config: { buttonLabel: '<em>Tab</em>' } } };
      const leafEntry = { compConfigJson: leaf };
      const groupEntry = { compConfigJson: group, component: { formFieldCompMapEntries: [leafEntry] } };
      const tabEntry = { compConfigJson: tab, component: { formFieldCompMapEntries: [groupEntry] } };
      spyOnProperty(component as any, 'formComponent', 'get').and.returnValue({
        formDefMap: source === 'form config' ? { formConfig: { componentDefinitions: [tab] } } : undefined,
        componentDefArr: [tabEntry],
      });
      (component as any).formFieldCompMapEntry = { compConfigJson: { component: { config: { includeTabLabel: true } } } };
      expect(component.getValidationSummaryLabel({
        id: 'field', message: '<strong>Field &amp; partners</strong>', errors: [],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0, 'component', 'config', 'componentDefinitions', 0, 'component', 'config', 'componentDefinitions', 0],
          angularComponents: ['tab', 'group', 'field'], dataModel: [], layout: [],
        },
      })).toBe('Tab - Group - Field & partners');
    });
  }

  it('should reveal tabs implemented by a dynamically loaded component instance', () => {
    const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    const component = fixture.componentInstance as any;
    const selectTab = jasmine.createSpy('selectTab');
    spyOn(component, 'findComponentEntryByName').and.callFake((name: string) =>
      name === 'mainTab'
        ? {
            compConfigJson: { component: { class: 'TabComponent' } },
            component: { selectTab },
          }
        : undefined,
    );

    component.revealTabParents(['mainTab', 'storage', 'field']);

    expect(selectTab).toHaveBeenCalledOnceWith('storage');
  });

  it('should cancel a deferred validation refresh when destroyed', fakeAsync(() => {
    const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    const component = fixture.componentInstance as any;
    const queueRefreshSpy = spyOn(component, 'queueValidationErrorsRefresh');

    component.deferValidationErrorsRefresh();
    fixture.destroy();
    tick(0);

    expect(queueRefreshSpy).not.toHaveBeenCalled();
  }));

  it('should hide the valid banner by default when the form has no errors', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });

    // assert
    const nativeEl: HTMLElement = fixture.nativeElement;
    expect(nativeEl.querySelector('div.alert-info')).toBeNull();
  });

  it('should display "The form is valid." when showWhenValid is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'validation_summary_1',
          component: {
            class: "ValidationSummaryComponent",
            config: {
              showWhenValid: true
            }
          }
        },
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });

    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-info');
    expect(el?.textContent).toContain('The form is valid.');
  });
  it('clears a revealed root failure after successful revalidation without a value edit', async () => {
    let available = false;
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'revalidated-root-error',
      validators: [{
        class: 'jsonata-expression',
        config: { expression: 'true', evaluator: async () => available },
        targetField: { dataModel: ['title'] },
        message: 'Title is unavailable',
      }],
      componentDefinitions: [
        {
          name: 'title',
          component: { class: 'SimpleInputComponent', config: { showValidIndicator: true } },
          model: { class: 'SimpleInputModel', config: { value: 'Same title' } },
          layout: { class: 'DefaultLayout' },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { showWhenValid: true } } },
      ],
    }, { editMode: true });
    const root: HTMLElement = fixture.nativeElement;
    const field = root.querySelector('input')!;
    const form = formComponent.form!;
    const value = form.getRawValue();
    const update = spyOn(formComponent.recordService, 'update');

    await formComponent.saveForm({ force: true });
    await fixture.whenStable();
    expect(update).not.toHaveBeenCalled();
    expect(form.untouched).toBeTrue();
    expect(root.querySelector('.validation-summary')?.textContent).toContain('Title is unavailable');
    expect(root.querySelector('.rb-form-field-error-summary')?.textContent).toContain('Title is unavailable');
    expect(field.classList.contains('is-invalid')).toBeTrue();
    expect(root.querySelector('.alert-info')).toBeNull();

    available = true;
    formComponent.broadcastFormStatus();
    await fixture.whenStable();

    expect(form.getRawValue()).toEqual(value);
    expect(form.valid).toBeTrue();
    expect(root.querySelector('.validation-summary')).toBeNull();
    expect(root.querySelector('.rb-form-field-error-summary')).toBeNull();
    expect(field.classList.contains('is-invalid')).toBeFalse();
    expect(field.classList.contains('is-valid')).toBeTrue();
    expect(root.querySelector('.alert-info')?.textContent).toContain('The form is valid.');
  });

  it('keeps a save-only root failure in the summary and on its target after interactive validation passes', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'save-only-root-error',
      enabledValidationGroups: ['all'],
      validationGroups: {
        all: { description: '', initialMembership: 'all' },
        submit: { description: '', initialMembership: 'none' },
      },
      validators: [
        {
          class: 'jsonata-expression',
          config: { expression: 'true' },
          targetField: { dataModel: ['contributor_ci'] },
          message: 'Choose a CI before submitting',
        },
        {
          class: 'jsonata-expression',
          groups: { include: ['submit'], exclude: ['all'] },
          config: { expression: 'contributor_ci != "same"' },
          targetField: { dataModel: ['contributor_ci'] },
          message: 'Choose a CI before submitting',
        },
      ],
      componentDefinitions: [
        {
          name: 'contributor_ci',
          component: { class: 'SimpleInputComponent', config: { showValidIndicator: true } },
          model: { class: 'SimpleInputModel', config: { value: 'same' } },
          layout: { class: 'DefaultLayout' },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { showWhenValid: true } } },
      ],
    }, { editMode: true });
    const root: HTMLElement = fixture.nativeElement;
    const field = root.querySelector('input')!;
    const form = formComponent.form!;
    const control = form.get('contributor_ci')!;
    const summary = formComponent.componentDefArr[1].component as ValidationSummaryFieldComponent;
    const update = spyOn(formComponent.recordService, 'update');

    await fixture.whenStable();
    expect(root.querySelector('.alert-info')?.textContent).toContain('The form is valid.');
    expect(field.classList.contains('is-valid')).toBeTrue();

    await formComponent.saveForm({ force: true, enabledValidationGroups: ['all', 'submit'] });
    await fixture.whenStable();
    formComponent.broadcastFormStatus();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(update).not.toHaveBeenCalled();
    expect(form.valid).toBeTrue();
    expect(control.valid).toBeTrue();
    expect(control.untouched).toBeTrue();
    expect(summary.hasValidationErrors).toBeTrue();
    expect(root.querySelector('.alert-info')).toBeNull();
    expect(root.querySelector('.validation-summary')?.textContent).toContain('Choose a CI before submitting');
    expect(root.querySelector('.rb-form-field-error-summary')?.textContent).toContain('Choose a CI before submitting');
    expect(field.classList.contains('is-invalid')).toBeTrue();
    expect(field.classList.contains('is-valid')).toBeFalse();
  });

  it('should contain one failed validation for the required text field that is empty', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture, formComponent } = await createFormWithTouchedControls(formConfig);

    // assert
    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-danger');
    const link = el?.querySelector('a[data-validation-summary-id="form-item-id-text-1-event"]');
    const errorItem = el?.querySelector('li[data-validation-error-class="required"][data-validation-error-message="@validator-error-required"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('form-item-id-text-1-event');
    expect(errorItem).toBeTruthy();

    // Ensure the expected failures have the expected lineage paths.
    const validationSummary = fixture.componentInstance.componentDefArr[1].component as ValidationSummaryFieldComponent;
    expect(await validationSummary.allValidationErrorsDisplay()).toEqual([
      {
        id: 'form-item-id-text-1-event',
        message: null,
        errors: [{ class: 'required', message: "@validator-error-required", params: { required: true, actual: '' } }],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['text_1_event'],
          angularComponents: ['text_1_event'],
          angularComponentsJsonPointer: '/text_1_event',
          layout: ['text_1_event-layout'],
          layoutJsonPointer: '/text_1_event-layout'
        }
      }
    ]);
  });

  it('should translate validation summary ids when a language entry exists', async () => {
    translationService.translationMap['form-item-id-text-1-event'] = 'Translated Text Field';
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormWithTouchedControls(formConfig);

    const link = (fixture.nativeElement as HTMLElement).querySelector('a[data-validation-summary-id="form-item-id-text-1-event"]');
    expect(link?.textContent).toContain('Translated Text Field');
  });

  it('should not keep a stale required error for a hydrated repeatable field', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
        {
          name: 'contributor_dmp_permissions',
          model: {
            class: 'RepeatableModel',
            config: {
              value: [
                { name: 'Existing User', email: 'existing@example.edu', role: 'View&Edit' }
              ],
              validators: [{ class: 'required' }]
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                model: {
                  class: 'SimpleInputModel',
                  config: {}
                },
                component: {
                  class: 'SimpleInputComponent'
                }
              }
            }
          },
          layout: {
            class: 'DefaultLayout',
            config: {
              label: '@dmpt-user-permissions-tab-dmp-permissions'
            }
          }
        },
      ]
    };

    const { fixture } = await createFormWithTouchedControls(formConfig);
    await fixture.whenStable();
    fixture.detectChanges();

    const validationSummary = fixture.componentInstance.componentDefArr[0].component as ValidationSummaryFieldComponent;
    const summaryErrors = await validationSummary.allValidationErrorsDisplay();
    expect(summaryErrors.map((summary) => summary.id)).not.toContain('form-item-id-contributor-dmp-permissions');
    expect(fixture.nativeElement.querySelector('[data-validation-summary-id="form-item-id-contributor-dmp-permissions"]')).toBeNull();
  });

  it('should remove a validation summary item when the field becomes valid while the form remains invalid', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'text_2_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture, formComponent } = await createFormWithTouchedControls(formConfig);
    const validationSummary = fixture.componentInstance.componentDefArr[2].component as ValidationSummaryFieldComponent;
    const initialSummaryErrors = await validationSummary.allValidationErrorsDisplay();
    expect(initialSummaryErrors.map((summary) => summary.id)).toContain('form-item-id-text-1-event');
    expect(initialSummaryErrors.map((summary) => summary.id)).toContain('form-item-id-text-2-event');

    formComponent.form?.get('text_1_event')?.setValue('Valid project name');
    await fixture.whenStable();
    fixture.detectChanges();

    const updatedSummaryErrors = await validationSummary.allValidationErrorsDisplay();
    expect(formComponent.form?.status).toBe('INVALID');
    expect(updatedSummaryErrors.map((summary) => summary.id)).not.toContain('form-item-id-text-1-event');
    expect(updatedSummaryErrors.map((summary) => summary.id)).toContain('form-item-id-text-2-event');
  });

  it('should produce unique error track keys across summaries for matching errors', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'text_2_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture } = await createFormWithTouchedControls(formConfig);
    const validationSummary = fixture.componentInstance.componentDefArr[2].component as ValidationSummaryFieldComponent;
    const summaryErrors = await validationSummary.allValidationErrorsDisplay();

    // assert
    expect(summaryErrors.length).toBe(2);
    const firstError = summaryErrors[0].errors[0];
    const secondError = summaryErrors[1].errors[0];
    expect(firstError.class).toBe(secondError.class);
    expect(firstError.message).toBe(secondError.message);

    const firstTrackKey = validationSummary.trackValidationError(firstError, 0);
    const secondTrackKey = validationSummary.trackValidationError(secondError, 0);
    expect(firstTrackKey).toEqual(secondTrackKey);
  });

  it('should publish field focus request event when clicking a validation summary link', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [{ class: 'required' }]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const eventBus = TestBed.inject(FormComponentEventBus);
    const publishSpy = spyOn(eventBus, 'publish').and.callThrough();
    const { fixture, formComponent } = await createFormWithTouchedControls(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('a[data-validation-summary-id="form-item-id-text-1-event"]') as HTMLAnchorElement | null;

    expect(link).toBeTruthy();
    link?.click();

    expect(publishSpy).toHaveBeenCalled();
    const focusRequest = publishSpy.calls.allArgs()
      .map(args => args[0] as any)
      .find((event) => event.type === FormComponentEventType.FIELD_FOCUS_REQUEST);
    expect(focusRequest).toBeTruthy();
    expect(focusRequest.fieldId).toBe('form-item-id-text-1-event');
    expect(focusRequest.targetElementId).toBe('form-item-id-text-1-event');
    expect(focusRequest.lineagePath).toEqual(['text_1_event']);
    expect(focusRequest.source).toBe('validation-summary');
    expect(focusRequest.sourceId).toBe(formComponent.eventScopeId);
  });

  it('should reveal hidden tab and focus field when clicking a validation summary link', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'main_tab',
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  name: 'tab1',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: true,
                      componentDefinitions: [
                        {
                          name: 'textfield_1',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: 'Tab one'
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  name: 'tab2',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: false,
                      componentDefinitions: [
                        {
                          name: 'textfield_2',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: '',
                              validators: [
                                { class: 'required' },
                              ]
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          },
          layout: {
            class: 'TabLayout'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture } = await createFormWithTouchedControls(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const mainTab = fixture.componentInstance.componentDefArr[0].component as TabComponent;
    expect(mainTab.activeTabId).toBe('tab1');

    const link = nativeEl.querySelector('a[data-validation-summary-id="form-item-id-textfield-2"]') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    link?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // assert
    expect(mainTab.activeTabId).toBe('tab2');
    const inputInTab2 = nativeEl.querySelector('#tab2-tab-content input[type="text"]') as HTMLInputElement | null;
    expect(inputInTab2).toBeTruthy();
    expect(document.activeElement).toBe(inputInTab2);
  });

  it('should reveal hidden tab and focus repeatable field when clicking a validation summary link', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'main_tab',
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  name: 'tab1',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: true,
                      componentDefinitions: [
                        {
                          name: 'textfield_1',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: 'Tab one'
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  name: 'tab2',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: false,
                      componentDefinitions: [
                        {
                          name: 'repeatable_textfield_1',
                          model: {
                            class: 'RepeatableModel',
                            config: {
                              value: ['']
                            }
                          },
                          component: {
                            class: 'RepeatableComponent',
                            config: {
                              elementTemplate: {
                                name: '',
                                model: {
                                  class: 'SimpleInputModel',
                                  config: {
                                    value: '',
                                    validators: [{ class: 'required' }]
                                  }
                                },
                                component: {
                                  class: 'SimpleInputComponent'
                                }
                              }
                            }
                          },
                          layout: {
                            class: 'DefaultLayout',
                            config: {
                              label: 'Repeatable TextField with default wrapper defined'
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          },
          layout: {
            class: 'TabLayout'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormWithTouchedControls(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const mainTab = fixture.componentInstance.componentDefArr[0].component as TabComponent;
    expect(mainTab.activeTabId).toBe('tab1');

    const link = nativeEl.querySelector('a[data-validation-summary-id^="form-item-id-repeatable-textfield-1-"]') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    link?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mainTab.activeTabId).toBe('tab2');
    const repeatableInput = nativeEl.querySelector('#tab2-tab-content input[type="text"]') as HTMLInputElement | null;
    expect(repeatableInput).toBeTruthy();
    expect(document.activeElement).toBe(repeatableInput);
  });

  it('should render grouped field labels with parent context in validation summary', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayout',
            config: {
              label: 'Group label',
            },
          },
          model: {
            class: 'GroupModel',
            config: {
              defaultValue: {},
            },
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'text_1_event',
                  layout: {
                    class: 'DefaultLayout',
                    config: {
                      label: 'TextField with default wrapper defined',
                    },
                  },
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: '',
                      validators: [{ class: 'required' }]
                    }
                  },
                  component: {
                    class: 'SimpleInputComponent'
                  }
                },
              ]
            }
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormWithTouchedControls(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('.validation-summary-item a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Group label - TextField with default wrapper defined');
  });

  it('should include nested group labels in validation summary labels', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayout',
            config: { label: 'People' },
          },
          model: {
            class: 'GroupModel',
            config: { defaultValue: {} },
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'group_2_component',
                  layout: {
                    class: 'DefaultLayout',
                    config: { label: '@dmpt-people-tab-record-administrator' },
                  },
                  model: {
                    class: 'GroupModel',
                    config: { defaultValue: {} },
                  },
                  component: {
                    class: 'GroupComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'email_field',
                          layout: {
                            class: 'DefaultLayout',
                            config: { label: 'Email' },
                          },
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: '',
                              validators: [{ class: 'required' }],
                            }
                          },
                          component: { class: 'SimpleInputComponent' }
                        },
                      ]
                    }
                  }
                },
              ]
            }
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormWithTouchedControls(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('.validation-summary-item a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('People - @dmpt-people-tab-record-administrator - Email');
  });

  it('should include tab labels only when includeTabLabel is true', async () => {
    const createTabComponentDefinition = (): any => ({
      name: 'main_tab',
      component: {
        class: 'TabComponent',
        config: {
          tabs: [
            {
              name: 'project_tab',
              layout: {
                class: 'TabContentLayout',
                config: { buttonLabel: 'Project' }
              },
              component: {
                class: 'TabContentComponent',
                config: {
                  componentDefinitions: [
                    {
                      name: 'project_name',
                      layout: {
                        class: 'DefaultLayout',
                        config: { label: 'Project name' }
                      },
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          value: '',
                          validators: [{ class: 'required' }]
                        }
                      },
                      component: { class: 'SimpleInputComponent' }
                    },
                  ]
                }
              }
            }
          ]
        }
      },
      layout: { class: 'TabLayout' }
    });

    const formConfigWithoutTabLabel: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: { defaultComponentCssClasses: 'row' },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        createTabComponentDefinition(),
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const formConfigWithTabLabel: FormConfigFrame = {
      ...formConfigWithoutTabLabel,
      componentDefinitions: [
        createTabComponentDefinition(),
        {
          name: 'validation_summary_1',
          component: {
            class: "ValidationSummaryComponent",
            config: { includeTabLabel: true } as any
          }
        },
      ]
    };

    const { fixture: fixtureWithoutTabLabel } = await createFormWithTouchedControls(formConfigWithoutTabLabel);
    const { fixture: fixtureWithTabLabel } = await createFormWithTouchedControls(formConfigWithTabLabel);

    const linkWithoutTabLabel = (fixtureWithoutTabLabel.nativeElement as HTMLElement).querySelector('.validation-summary-item a');
    expect(linkWithoutTabLabel?.textContent?.trim()).toBe('Project name');

    const linkWithTabLabel = (fixtureWithTabLabel.nativeElement as HTMLElement).querySelector('.validation-summary-item a');
    expect(linkWithTabLabel?.textContent?.trim()).toBe('Project - Project name');
  });

  it('should use repeatable parent label instead of form-item-id when repeatable element has no own label', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'repeatable_textfield_1',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['not-matching-prefix'],
            },
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                model: {
                  class: 'SimpleInputModel',
                  config: {
                    validators: [
                      {
                        class: 'pattern',
                        config: {
                          pattern: /^prefix.*/,
                          description: 'must start with prefix',
                        },
                      },
                    ],
                  },
                },
                component: {
                  class: 'SimpleInputComponent',
                },
                layout: {
                  class: 'RepeatableElementLayout',
                },
              },
            },
          },
          layout: {
            class: 'DefaultLayout',
            config: {
              label: 'Repeatable TextField with default wrapper defined',
            },
          },
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormWithTouchedControls(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('.validation-summary-item a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Repeatable TextField with default wrapper defined');
  });

  it('should include form component errors', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      validators : [
        {
          class: 'pattern',
          config: {pattern: '[0-9]+', description: "must be a number"},
        },
        {
          class: 'different-values',
          config: {controlNames: ['text_1_event', 'text_2_event']},
          targetField: {formConfig: ['componentDefinitions', 0]},
        },
      ],
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {value: ''},
          },
          component: {class: 'SimpleInputComponent'}
        },
        {
          name: 'text_2_event',
          model: {
            class: 'SimpleInputModel',
            config: {value: '', validators: [{class: 'required'}]},
          },
          component: {class: 'SimpleInputComponent'}
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };
    const { fixture, formComponent } = await createFormWithTouchedControls(formConfig);

    // Trigger 'queueValidationErrorsRefresh' by making a change to the form.
    const control = fixture.componentInstance.componentDefArr[0].model?.formControl;
    control?.setValue('change value');
    control?.setValue('');
    formComponent.form!.markAsDirty();
    fixture.detectChanges();
    await fixture.whenStable();

    const summaryComponent = fixture.componentInstance.componentDefArr[2].component as ValidationSummaryFieldComponent;

    expect(await summaryComponent.allValidationErrorsDisplay()).toEqual([
      {
        id: null,
        message:  '@validator-error-form-level',
        errors: [
          {
            class: 'pattern', message: '@validator-error-pattern', params: {
              requiredPattern: '^[0-9]+$',
              description: 'must be a number',
              actual: '[object Object]',
            },
          }
        ],
        lineagePaths: {
          formConfig: [],
          dataModel: [],
          angularComponents: [],
          layout: [],
          angularComponentsJsonPointer: '',
          layoutJsonPointer: ''
        }
      },
      {
        id: 'form-item-id-text-2-event',
        message: null,
        errors: [{class: 'required', message: '@validator-error-required', params: {required: true, actual: ''}}],
        lineagePaths: {
          formConfig: ['componentDefinitions', 1],
          dataModel: ['text_2_event'],
          angularComponents: ['text_2_event'],
          layout: ['text_2_event-layout'],
          angularComponentsJsonPointer: '/text_2_event',
          layoutJsonPointer: '/text_2_event-layout'
        }
      },
      {
        id: 'form-item-id-text-1-event',
        message: null,
        errors: [
          {
            class: 'different-values', message: '@validator-error-different-values', params: {
              controlNames: ['text_1_event', 'text_2_event'], controlCount: 2, valueCount: 1, values: ['']
            },
            targetField: {formConfig: ['componentDefinitions', 0]},
          }
        ],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['text_1_event'],
          angularComponents: ['text_1_event'],
          layout: ['text_1_event-layout'],
          angularComponentsJsonPointer: '/text_1_event',
          layoutJsonPointer: '/text_1_event-layout'
        }
      },
    ]);

    const nativeEl: HTMLElement = fixture.nativeElement;
    const summaryItems = nativeEl.querySelectorAll('.validation-summary-item');
    expect(summaryItems.length).toEqual(3);
    expect(Array.from(summaryItems).map(l => l.textContent?.trim())).toEqual([
      '@validator-error-form-level@validator-error-pattern',
      'form-item-id-text-2-event@validator-error-required',
      'form-item-id-text-1-event@validator-error-different-values',
    ]);
  });
});
