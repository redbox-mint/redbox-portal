import {TestBed} from '@angular/core/testing';
import {FormFieldComponentStatus} from '@researchdatabox/sails-ng-common';
import {LoggerService} from '../logger.service';
import {UtilityService} from '../utility.service';
import {FormFieldCompMapEntry, FormFieldBaseComponent} from './form-field-base.component';
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

  it('shares a stable label target between layout and control for one runtime entry', () => {
    const entry: FormFieldCompMapEntry = { compConfigJson: {
      name: 'title', component: { class: 'SimpleInputComponent' }
    } };
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
    const definitions: FormFieldCompMapEntry['compConfigJson'][] = [
      { name: 'field', component: { class: 'SimpleInputComponent', config: { type: 'hidden' } as FormFieldCompMapEntry['compConfigJson']['component']['config'] } },
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
