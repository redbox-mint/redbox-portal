import {TestBed} from '@angular/core/testing';
import {ChangeDetectionStrategy, Component, ViewChild, ViewContainerRef, provideZonelessChangeDetection, signal} from '@angular/core';
import {FormFieldComponentStatus} from '@researchdatabox/sails-ng-common';
import {LoggerService} from '../logger.service';
import {UtilityService} from '../utility.service';
import {FormFieldBaseComponent} from './form-field-base.component';
import {FormFieldModel} from "./base.model";

@Component({
  template: `<p [hidden]="!isVisible">{{ label }}</p>
    @if (model) {
      <output [class.invalid]="!isValid" [class.touched]="formControl.touched">{{ renderedValue }}</output>
    }`,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class TestFormFieldBaseComponent extends FormFieldBaseComponent<unknown> {
  valueReads = 0;

  get renderedValue(): unknown {
    this.valueReads++;
    return this.model?.getValue();
  }

  public waitForViewReady(): Promise<void> {
    return this.untilViewIsInitialised();
  }
}

@Component({
  template: '{{ unrelated() }}<ng-container #fields />',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class FormFieldsHostComponent {
  readonly unrelated = signal(0);
  @ViewChild('fields', {read: ViewContainerRef, static: true}) fields!: ViewContainerRef;
}

class TestFormFieldModel extends FormFieldModel<unknown> {
  protected override logName = "TestFormFieldModel";
}


describe('FormFieldBaseComponent', () => {
  let component: TestFormFieldBaseComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestFormFieldBaseComponent, FormFieldsHostComponent],
      providers: [LoggerService, UtilityService, provideZonelessChangeDetection()]
    });
    component = TestBed.runInInjectionContext(() => new TestFormFieldBaseComponent());
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
        component: {class: 'SimpleInputComponent', config: {label: 'Initial label'}}
      }
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
    const leftModel = new TestFormFieldModel({class: 'SimpleInputModel', config: {value: 'Left'}});
    const rightModel = new TestFormFieldModel({class: 'SimpleInputModel', config: {value: 'Right'}});
    for (const [ref, model] of [[left, leftModel], [right, rightModel]] as const) {
      await ref.instance.initComponent({
        componentRef: ref,
        model,
        compConfigJson: {name: 'field', component: {class: 'SimpleInputComponent', config: {}}}
      });
    }
    await fixture.whenStable();
    const rightReads = right.instance.valueReads;

    leftModel.setValue('Updated remotely');
    leftModel.formControl!.markAsTouched();
    leftModel.formControl!.setErrors({required: true});
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
      model: new TestFormFieldModel({class: "SimpleInputModel"}),
      compConfigJson: {
        name: "testing-component-model-disabled",
        component: {class: "SimpleInputComponent", config: {}}
      }
    });
    expect(component.isDisabled).toBeFalse();

    component.setDisabled(true);
    expect(component.isDisabled).toBeTrue();

    expect(component.model?.isDisabled).toBeTrue();
  });
  it('should set formControl.disabled when component.disabled is set', async () => {
    await component.initComponent({
      modelClass: TestFormFieldModel,
      model: new TestFormFieldModel({class: "SimpleInputModel"}),
      compConfigJson: {
        name: "testing-component-model-disabled",
        component: {class: "SimpleInputComponent", config: {}}
      }
    });
    expect(component.isDisabled).toBeFalse();

    component.setProperty('disabled', 'yes');
    expect(component.isDisabled).toBeTrue();

    expect(component.model?.isDisabled).toBeTrue();
  });
});
