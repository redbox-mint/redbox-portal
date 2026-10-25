import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule, FormComponentProps } from '../helpers.spec';
import { FormComponentEventBus, createFormSaveSuccessEvent } from '../form-state';
import { RecordPermissionsComponent } from './record-permissions.component';
import { RecordPermissionsService, RecordPermissionsSummary } from '../service/record-permissions.service';

const summary: RecordPermissionsSummary = {
  edit: [{ username: 'forms-editor', name: 'Forms Editor', email: 'forms-editor@example.invalid' }],
  view: [{ username: 'forms-viewer', name: 'Forms Viewer', email: 'forms-viewer@example.invalid' }],
  editPending: ['forms-pending-edit@example.invalid'],
  viewPending: ['forms-pending-view@example.invalid'],
  editRoles: ['Librarians'],
  viewRoles: ['Researcher'],
};
const props = (oid = 'forms-record', editMode = true): FormComponentProps => ({
  oid,
  editMode,
  recordType: 'rdmp',
  formName: 'default-1.0-draft',
  downloadAndCreateOnInit: false,
});
const config = (visible = true): FormConfigFrame => ({
  name: 'forms-permissions',
  componentDefinitions: [
    { name: 'permissions', component: { class: 'RecordPermissionsComponent', config: { visible } } },
  ],
});

describe('RecordPermissionsComponent', () => {
  let service: jasmine.SpyObj<RecordPermissionsService>;
  beforeEach(async () => {
    service = jasmine.createSpyObj<RecordPermissionsService>('RecordPermissionsService', ['getSummary']);
    service.getSummary.and.resolveTo(summary);
    const { translationService } = await createTestbedModule({
      declarations: { RecordPermissionsComponent },
      providers: { RecordPermissionsService: { provide: RecordPermissionsService, useValue: service } },
    });
    Object.assign(translationService.translationMap, {
      'form-record-permissions-usereditheading': 'Users with edit access',
      'form-record-permissions-userviewheading': 'Users with view access',
      'form-record-permissions-userpendingeditheading': 'Users with pending edit access',
      'form-record-permissions-userpendingviewheading': 'Users with pending view access',
      'form-record-permissions-roleeditheading': 'System roles with edit access',
      'form-record-permissions-roleviewheading': 'System roles with view access',
      'form-record-permissions-usernametableheading': 'Username',
      'form-record-permissions-nametableheading': 'Name',
      'form-record-permissions-emailtableheading': 'Email',
      'form-record-permissions-rolenametableheading': 'Role name'
    });
  });

  it('renders all six accessible read-only tables and never creates a persisted control', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(config(), props());
    await fixture.whenStable();
    const element: HTMLElement = fixture.debugElement.query(By.directive(RecordPermissionsComponent)).nativeElement;
    expect(service.getSummary).toHaveBeenCalledWith('forms-record');
    expect(element.querySelectorAll('table').length).toBe(6);
    expect(Array.from(element.querySelectorAll('caption'), caption => caption.textContent?.trim())).toEqual([
      'Users with edit access', 'Users with view access', 'Users with pending edit access',
      'Users with pending view access', 'System roles with edit access', 'System roles with view access'
    ]);
    expect(Array.from(element.querySelectorAll('th'), heading => heading.textContent?.trim())).toEqual([
      'Username', 'Name', 'Email', 'Username', 'Name', 'Email', 'Email', 'Email', 'Role name', 'Role name'
    ]);
    expect(element.querySelectorAll('th[scope="col"]').length).toBe(10);
    for (const value of [
      'forms-editor',
      'Forms Editor',
      'forms-editor@example.invalid',
      'forms-viewer',
      'forms-pending-edit@example.invalid',
      'forms-pending-view@example.invalid',
      'Librarians',
      'Researcher',
    ]) {
      expect(element.textContent).toContain(value);
    }
    expect(element.querySelectorAll('input, select, textarea').length).toBe(0);
    expect(formComponent.form?.getRawValue() ?? {}).toEqual({});
  });

  it('does not request data while hidden for a restricted persona', async () => {
    const { fixture } = await createFormAndWaitForReady(config(false), props());
    await fixture.whenStable();
    expect(service.getSummary).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.redbox-record-permissions')).toBeNull();
  });

  it('preserves the tagged edit-only behavior', async () => {
    const { fixture } = await createFormAndWaitForReady(config(), props('forms-record', false));
    await fixture.whenStable();
    expect(service.getSummary).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.redbox-record-permissions')).toBeNull();
  });

  it('loads after the first save assigns an OID and refreshes on later saves', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(config(), props(''));
    const component = fixture.debugElement.query(By.directive(RecordPermissionsComponent))
      .componentInstance as RecordPermissionsComponent;
    expect(service.getSummary).not.toHaveBeenCalled();
    expect(component.summary()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('table').length).toBe(6);
    expect(fixture.nativeElement.querySelector('.redbox-record-permissions [role="status"]')).not.toBeNull();
    formComponent.oid.set('forms-first-save');
    TestBed.inject(FormComponentEventBus).publish(createFormSaveSuccessEvent());
    await fixture.whenStable();
    expect(service.getSummary).toHaveBeenCalledWith('forms-first-save');
    expect(component.summary()).toEqual(summary);
    service.getSummary.calls.reset();
    TestBed.inject(FormComponentEventBus).publish(createFormSaveSuccessEvent());
    await fixture.whenStable();
    expect(service.getSummary).toHaveBeenCalledTimes(1);
    expect(formComponent.form?.getRawValue() ?? {}).toEqual({});
  });

  it('announces loading and failure, clears stale permissions, and permits retry', async () => {
    const { fixture } = await createFormAndWaitForReady(config(), props());
    const component = fixture.debugElement.query(By.directive(RecordPermissionsComponent))
      .componentInstance as RecordPermissionsComponent;
    let rejectRequest!: (reason: Error) => void;
    service.getSummary.and.returnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      })
    );
    const pending = component.refresh();
    fixture.detectChanges();
    expect(component.summary()).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    rejectRequest(new Error('403'));
    await pending;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('table').length).toBe(0);
    service.getSummary.and.resolveTo(summary);
    const retry: HTMLButtonElement = fixture.nativeElement.querySelector('.redbox-record-permissions button');
    retry.click();
    await fixture.whenStable();
    expect(component.failed()).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('table').length).toBe(6);
  });

  it('discards an earlier record response when the current OID changes', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(config(), props());
    const component = fixture.debugElement.query(By.directive(RecordPermissionsComponent))
      .componentInstance as RecordPermissionsComponent;
    let resolveOld!: (value: RecordPermissionsSummary) => void;
    service.getSummary.and.returnValue(
      new Promise(resolve => {
        resolveOld = resolve;
      })
    );
    const old = component.refresh();
    service.getSummary.and.resolveTo({ ...summary, editRoles: ['Admin'] });
    formComponent.oid.set('forms-next-record');
    await fixture.whenStable();
    resolveOld(summary);
    await old;
    expect(component.summary()?.editRoles).toEqual(['Admin']);
  });
});
