import {TestBed} from '@angular/core/testing';
import {ChangeDetectionStrategy, Component, provideZonelessChangeDetection} from '@angular/core';
import {FormFieldComponentStatus} from '@researchdatabox/sails-ng-common';
import {LoggerService} from '../logger.service';
import {UtilityService} from '../utility.service';
import {FormFieldBaseComponent} from './form-field-base.component';
import {FormFieldModel} from "./base.model";

@Component({template: '<p [hidden]="!isVisible">{{ label }}</p>', standalone: true, changeDetection: ChangeDetectionStrategy.Eager})
class TestFormFieldBaseComponent extends FormFieldBaseComponent<unknown> {
  public waitForViewReady(): Promise<void> {
    return this.untilViewIsInitialised();
  }
}

class TestFormFieldModel extends FormFieldModel<unknown> {
  protected override logName = "TestFormFieldModel";
}


describe('FormFieldBaseComponent', () => {
  let component: TestFormFieldBaseComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestFormFieldBaseComponent],
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
