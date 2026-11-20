import { TestBed } from '@angular/core/testing';
import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  ViewContainerRef,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { AbstractControl, Validators } from '@angular/forms';
import {
  FormFieldComponentStatus,
  FormValidatorComponentErrors,
  SimpleInputFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';
import { LoggerService } from '../logger.service';
import { UtilityService } from '../utility.service';
import { FormFieldCompMapEntry, FormFieldBaseComponent } from './form-field-base.component';
import { FormFieldModel } from './base.model';

@Component({
  template: `<p [hidden]="!isVisible">{{ label }}</p>
    @if (model) {
      <output [class.invalid]="!isValid" [class.touched]="formControl.touched">{{ renderedValue }}</output>
    }`,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestFormFieldBaseComponent extends FormFieldBaseComponent<unknown> {
  valueReads = 0;

  get renderedValue(): unknown {
    this.valueReads++;
    return this.model?.getValue();
  }
  public formHost: {
    getVisibleFieldValidationErrors?: (entry: FormFieldCompMapEntry) => FormValidatorComponentErrors[];
  } = {};

  protected override get formComponent() {
    return this.formHost;
  }

  public waitForViewReady(): Promise<void> {
    return this.untilViewIsInitialised();
  }
}

@Component({
  template: '{{ unrelated() }}<ng-container #fields />',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FormFieldsHostComponent {
  readonly unrelated = signal(0);
  @ViewChild('fields', { read: ViewContainerRef, static: true }) fields!: ViewContainerRef;
}

class TestFormFieldModel extends FormFieldModel<unknown> {
  protected override logName = 'TestFormFieldModel';
}

describe('FormFieldBaseComponent', () => {
  let component: TestFormFieldBaseComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestFormFieldBaseComponent, FormFieldsHostComponent],
      providers: [LoggerService, UtilityService, provideZonelessChangeDetection()],
    });
    component = TestBed.runInInjectionContext(() => new TestFormFieldBaseComponent());
  });

  describe('inline validation feedback', () => {
    const requiredError = { class: 'required', message: 'Required', params: {} };

    beforeEach(() => {
      component.model = new TestFormFieldModel({ class: 'SimpleInputModel', config: { value: null } });
      component.formFieldCompMapEntry = {
        compConfigJson: { name: 'title', component: { class: 'SimpleInputComponent' } },
        model: component.model,
      };
      component.formControl.setValidators(Validators.required);
      component.formControl.updateValueAndValidity();
    });

    it('keeps an untouched invalid field hidden even when it is dirty', () => {
      expect(component.formControl.invalid).toBeTrue();
      expect(component.showValidationErrors).toBeFalse();
      expect(component.showInvalidState).toBeFalse();

      component.formControl.markAsDirty();
      expect(component.showValidationErrors).toBeFalse();
      expect(component.showInvalidState).toBeFalse();
      expect(component.formControl.invalid).toBeTrue();
    });

    it('reveals a touched field without revealing an untouched sibling', () => {
      const sibling = TestBed.runInInjectionContext(() => new TestFormFieldBaseComponent());
      sibling.model = new TestFormFieldModel({ class: 'SimpleInputModel', config: { value: null } });
      sibling.formControl.setValidators(Validators.required);
      sibling.formControl.updateValueAndValidity();

      component.formControl.markAsTouched();
      expect(component.showValidationErrors).toBeTrue();
      expect(component.showInvalidState).toBeTrue();
      expect(sibling.formControl.invalid).toBeTrue();
      expect(sibling.showValidationErrors).toBeFalse();
      expect(sibling.showInvalidState).toBeFalse();

      component.formControl.setValue('Project');
      expect(component.showValidationErrors).toBeTrue();
      expect(component.showInvalidState).toBeFalse();
    });

    it('shows invalid state only for the control revealed by a failed save', () => {
      const revealed = signal<AbstractControl | null>(null);
      component.formHost = {
        getVisibleFieldValidationErrors: entry => {
          const control = entry.model?.formControl;
          return control && control === revealed() && control.invalid ? [requiredError] : [];
        },
      };
      expect(component.showValidationErrors).toBeFalse();
      expect(component.showInvalidState).toBeFalse();

      revealed.set(component.formControl);
      expect(component.formControl.untouched).toBeTrue();
      expect(component.showValidationErrors).toBeTrue();
      expect(component.showInvalidState).toBeTrue();
      component.formControl.markAsPristine();
      expect(component.showInvalidState).toBeTrue();

      component.formControl.setValue('Project');
      expect(component.showValidationErrors).toBeFalse();
      expect(component.showInvalidState).toBeFalse();

      component.formControl.reset();
      revealed.set(null);
      expect(component.formControl.invalid).toBeTrue();
      expect(component.showValidationErrors).toBeFalse();
      expect(component.showInvalidState).toBeFalse();
    });

    it('shows a save-only error on a control that passes interactive validation', () => {
      component.formControl.setValue('Valid for editing');
      component.formHost = { getVisibleFieldValidationErrors: () => [requiredError] };
      spyOnProperty(component, 'showValidIndicator', 'get').and.returnValue(true);

      expect(component.formControl.valid).toBeTrue();
      expect(component.showValidationErrors).toBeTrue();
      expect(component.showInvalidState).toBeTrue();
      expect(component.showValidState).toBeFalse();
    });

    it('keeps an unbound field hidden on a host without save-attempt tracking', () => {
      component.model = undefined;
      component.formFieldCompMapEntry = undefined;
      expect(component.showValidationErrors).toBeFalse();
      expect(component.showInvalidState).toBeFalse();
    });
  });

  it('shares a stable label target between layout and control for one runtime entry', () => {
    const entry: FormFieldCompMapEntry = {
      compConfigJson: {
        name: 'title',
        component: { class: 'SimpleInputComponent' },
      },
    };
    component.formFieldCompMapEntry = entry;
    const layout = TestBed.runInInjectionContext(() => new TestFormFieldBaseComponent());
    layout.formFieldCompMapEntry = entry;
    const id = layout.labelableControlId;
    expect(id).toBeTruthy();
    expect(component.labelableControlId).toBe(id);
    expect(layout.labelableControlId).toBe(id);
    component.formFieldCompMapEntry = { compConfigJson: structuredClone(entry.compConfigJson) };
    expect(component.labelableControlId).not.toBe(id);
    expect(entry.compConfigJson.component?.config).toBeUndefined();
  });

  it('does not generate label targets for hidden inputs or components with their own label handling', () => {
    expect(component.labelableControlId).toBeUndefined();
    const hiddenInput: SimpleInputFormComponentDefinitionFrame = {
      name: 'field',
      component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
    };
    const definitions: FormFieldCompMapEntry['compConfigJson'][] = [
      hiddenInput,
      { name: 'field', component: { class: 'GroupComponent' } },
      { name: 'field', component: { class: 'CheckboxInputComponent' } },
      { name: 'field', component: { class: 'RadioInputComponent' } },
    ];
    for (const compConfigJson of definitions) {
      const entry: FormFieldCompMapEntry = { compConfigJson };
      component.formFieldCompMapEntry = entry;
      expect(component.labelableControlId).toBeUndefined();
      expect(entry.labelableControlId).toBeUndefined();
    }
  });

  it('should resolve immediately when view is already initialised', async () => {
    component.status.set(FormFieldComponentStatus.INIT_VIEW_READY);
    await expectAsync(component.waitForViewReady()).toBeResolved();
  });

  it('renders host classes assigned after the initial view without a manual change detection pass', async () => {
    const fixture = TestBed.createComponent(TestFormFieldBaseComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();

    fixture.componentInstance.hostBindingCssClasses = 'rb-form-action-row-layout';
    await fixture.whenStable();
    expect(fixture.nativeElement.classList.contains('rb-form-action-row-layout')).toBeTrue();

    fixture.componentInstance.hostBindingCssClasses = undefined;
    await fixture.whenStable();
    expect(fixture.nativeElement.classList.contains('rb-form-action-row-layout')).toBeFalse();
  });

  it('should resolve when view status changes to initialised', async () => {
    const waitPromise = component.waitForViewReady();
    component.status.set(FormFieldComponentStatus.INIT_VIEW_READY);
    await expectAsync(waitPromise).toBeResolved();
  });

  it('renders externally changed field properties without a manual change detection pass', async () => {
    const fixture = TestBed.createComponent(TestFormFieldBaseComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.initComponent({
      componentRef: fixture.componentRef,
      compConfigJson: {
        name: 'external-properties',
        component: { class: 'SimpleInputComponent', config: { label: 'Initial label' } },
      },
    });
    await fixture.whenStable();
    const paragraph: HTMLParagraphElement = fixture.nativeElement.querySelector('p');
    expect(paragraph.textContent).toBe('Initial label');
    expect(paragraph.hidden).toBeFalse();

    fixture.componentInstance.setProperty('label', 'Changed label');
    fixture.componentInstance.setProperty('visible', false);
    await fixture.whenStable();
    expect(paragraph.textContent).toBe('Changed label');
    expect(paragraph.hidden).toBeTrue();
  });

  it('should reject when view status does not change before timeout', async () => {
    jasmine.clock().install();
    try {
      const waitPromise = component.waitForViewReady();
      jasmine.clock().tick(2001);
      await expectAsync(waitPromise).toBeRejectedWith('Timeout waiting for untilViewIsInitialised');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('renders external control changes while skipping unaffected fields and unsubscribes on destruction', async () => {
    const fixture = TestBed.createComponent(FormFieldsHostComponent);
    await fixture.whenStable();
    const left = fixture.componentInstance.fields.createComponent(TestFormFieldBaseComponent);
    const right = fixture.componentInstance.fields.createComponent(TestFormFieldBaseComponent);
    const leftModel = new TestFormFieldModel({ class: 'SimpleInputModel', config: { value: 'Left' } });
    const rightModel = new TestFormFieldModel({ class: 'SimpleInputModel', config: { value: 'Right' } });
    for (const [ref, model] of [
      [left, leftModel],
      [right, rightModel],
    ] as const) {
      await ref.instance.initComponent({
        componentRef: ref,
        model,
        compConfigJson: { name: 'field', component: { class: 'SimpleInputComponent', config: {} } },
      });
    }
    await fixture.whenStable();
    const rightReads = right.instance.valueReads;

    leftModel.setValue('Updated remotely');
    leftModel.formControl!.markAsTouched();
    leftModel.formControl!.setErrors({ required: true });
    await fixture.whenStable();
    const output: HTMLOutputElement = left.location.nativeElement.querySelector('output');
    expect(output.textContent).toBe('Updated remotely');
    expect(output.classList.contains('invalid')).toBeTrue();
    expect(output.classList.contains('touched')).toBeTrue();
    expect(right.instance.valueReads).toBe(rightReads);

    const leftReads = left.instance.valueReads;
    fixture.componentInstance.unrelated.set(1);
    await fixture.whenStable();
    expect(left.instance.valueReads).toBe(leftReads);
    expect(right.instance.valueReads).toBe(rightReads);

    const render = spyOn(left.instance, 'requestRender').and.callThrough();
    left.destroy();
    leftModel.setValue('After destruction');
    expect(render).not.toHaveBeenCalled();
  });
  it('should set formControl to disabled', async () => {
    await component.initComponent({
      modelClass: TestFormFieldModel,
      model: new TestFormFieldModel({ class: 'SimpleInputModel' }),
      compConfigJson: {
        name: 'testing-component-model-disabled',
        component: { class: 'SimpleInputComponent', config: {} },
      },
    });
    expect(component.isDisabled).toBeFalse();

    component.setDisabled(true);
    expect(component.isDisabled).toBeTrue();

    expect(component.model?.isDisabled).toBeTrue();
  });
  it('should set formControl.disabled when component.disabled is set', async () => {
    await component.initComponent({
      modelClass: TestFormFieldModel,
      model: new TestFormFieldModel({ class: 'SimpleInputModel' }),
      compConfigJson: {
        name: 'testing-component-model-disabled',
        component: { class: 'SimpleInputComponent', config: {} },
      },
    });
    expect(component.isDisabled).toBeFalse();

    component.setProperty('disabled', 'yes');
    expect(component.isDisabled).toBeTrue();

    expect(component.model?.isDisabled).toBeTrue();
  });
});
