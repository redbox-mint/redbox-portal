import { PendingTasks, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormComponent } from './form.component';
import { SimpleInputComponent } from './component/simple-input.component';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';

const config: FormConfigFrame = {
  name: 'deferred-debug-panel',
  componentDefinitions: [{
    name: 'title',
    component: { class: 'SimpleInputComponent' },
    model: { class: 'SimpleInputModel', config: { value: 'Saved title' } },
  }],
};

describe('Deferred form debug panel', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent } });
  });

  it('releases its pending task on destruction before a stalled download finishes', async () => {
    let release!: (component: Type<unknown>) => void;
    const deferred = new Promise<Type<unknown>>(resolve => release = resolve);
    const loader = spyOn<any>(FormComponent.prototype, 'loadDebugPanel').and.returnValue(deferred);
    const { fixture, formComponent } = await createFormAndWaitForReady(config);
    const tasks = TestBed.inject(PendingTasks);
    const addTask = tasks.add.bind(tasks);
    const removeTask = jasmine.createSpy('remove pending debug task');
    spyOn(tasks, 'add').and.callFake(() => {
      removeTask.and.callFake(addTask());
      return removeTask;
    });
    formComponent.debugState.isDebugEnabled.set(true);
    fixture.detectChanges();
    expect(loader).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(removeTask).toHaveBeenCalledTimes(1);
    release(FormComponent);
    await deferred;
    expect(formComponent.debugPanelComponent()).toBeNull();
    expect(removeTask).toHaveBeenCalledTimes(1);
  });

  it('retains form values after a failed download and retries when debug is enabled again', async () => {
    const loader = spyOn<any>(FormComponent.prototype, 'loadDebugPanel').and.rejectWith(new Error('offline'));
    const { fixture, formComponent } = await createFormAndWaitForReady(config);
    formComponent.debugState.isDebugEnabled.set(true);
    await fixture.whenStable();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(formComponent.debugPanelComponent()).toBeNull();
    expect(formComponent.form!.get('title')!.value).toBe('Saved title');
    expect(formComponent.form!.pristine).toBeTrue();
    formComponent.debugState.isDebugEnabled.set(false);
    await fixture.whenStable();
    loader.and.callThrough();
    formComponent.debugState.isDebugEnabled.set(true);
    await fixture.whenStable();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('redbox-form-debug-panel')).not.toBeNull();
  });
});
