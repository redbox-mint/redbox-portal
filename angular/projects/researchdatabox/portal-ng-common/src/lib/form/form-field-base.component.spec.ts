import {TestBed} from '@angular/core/testing';
import {FormFieldComponentStatus} from '@researchdatabox/sails-ng-common';
import {LoggerService} from '../logger.service';
import {UtilityService} from '../utility.service';
import {FormFieldBaseComponent} from './form-field-base.component';
import {FormFieldModel} from "./base.model";

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
      providers: [LoggerService, UtilityService]
    });
    component = TestBed.runInInjectionContext(() => new TestFormFieldBaseComponent());
  });

  it('should resolve immediately when view is already initialised', async () => {
    component.status.set(FormFieldComponentStatus.INIT_VIEW_READY);
    await expectAsync(component.waitForViewReady()).toBeResolved();
  });

  it('should resolve when view status changes to initialised', async () => {
    const waitPromise = component.waitForViewReady();
    component.status.set(FormFieldComponentStatus.INIT_VIEW_READY);
    await expectAsync(waitPromise).toBeResolved();
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
});
