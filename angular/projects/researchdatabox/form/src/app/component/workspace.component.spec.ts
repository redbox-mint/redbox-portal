import { TestBed } from '@angular/core/testing';
import { WorkspaceTypeService } from '@researchdatabox/portal-ng-common';
import { WorkspaceTypeDefinition } from '@researchdatabox/sails-ng-common';
import {
  FormComponentEventBus,
  createFormSaveFailureEvent,
  createFormSaveSuccessEvent,
} from '../form-state';
import { createTestbedModule } from '../helpers.spec';
import { WorkspaceSelectorComponent } from './workspace.component';

describe('WorkspaceSelectorComponent', () => {
  let component: WorkspaceSelectorComponent;
  let workspaceTypeService: jasmine.SpyObj<WorkspaceTypeService>;
  let eventBus: FormComponentEventBus;
  let formComponent: any;

  const configured: WorkspaceTypeDefinition = {
    name: 'configured',
    label: 'Configured workspace',
  };

  beforeEach(async () => {
    workspaceTypeService = jasmine.createSpyObj<WorkspaceTypeService>(
      'WorkspaceTypeService',
      ['getWorkspaceTypes'],
      { brandingAndPortalUrl: '/default/default' }
    );
    workspaceTypeService.getWorkspaceTypes.and.resolveTo({ status: true, workspaceTypes: [] });

    await createTestbedModule({
      declarations: { WorkspaceSelectorComponent },
      providers: {
        WorkspaceTypeService: { provide: WorkspaceTypeService, useValue: workspaceTypeService },
      },
    });

    component = TestBed.createComponent(WorkspaceSelectorComponent).componentInstance;
    eventBus = TestBed.inject(FormComponentEventBus);
    formComponent = {
      appName: 'Form::test',
      trimmedParams: { oid: () => 'oid-1' },
      enabledValidationGroups: ['default'],
      form: { dirty: false },
      changeLocationHref: jasmine.createSpy('changeLocationHref'),
    };
    (component as any).formComponentFromAppRef = { instance: formComponent };
  });

  it('normalizes configured types and merges server values while retaining selection', () => {
    expect((component as any).normalizeTypes(undefined)).toEqual([]);
    expect((component as any).normalizeTypes([null, {}, { name: ' ' }, configured])).toEqual([configured]);

    component.workspaceApps = [configured];
    component.workspaceApp = configured;
    (component as any).mergeWorkspaceTypes([
      { name: 'configured', label: 'Server label', description: 'Merged' },
      { name: 'new', label: 'New workspace' },
    ]);

    expect(component.workspaceApps).toEqual([
      jasmine.objectContaining({ name: 'configured', label: 'Server label', description: 'Merged' }),
      jasmine.objectContaining({ name: 'new' }),
    ]);
    expect(component.workspaceApp?.name).toBe('configured');
    component.selectWorkspace('new');
    expect(component.workspaceApp?.name).toBe('new');
    expect(component.trackWorkspace(0, component.workspaceApp!)).toBe('new');
  });

  it('loads server types and reports unsuccessful requests without discarding defaults', async () => {
    component.workspaceApps = [configured];
    component.workspaceApp = configured;
    workspaceTypeService.getWorkspaceTypes.and.resolveTo({
      status: true,
      workspaceTypes: [{ name: 'server', label: 'Server workspace' }],
    });

    await (component as any).initData();

    expect(component.loading).toBeFalse();
    expect(component.loadError).toBe('');
    expect(component.workspaceApps.map(item => item.name)).toEqual(['configured', 'server']);

    workspaceTypeService.getWorkspaceTypes.and.resolveTo({ status: false, workspaceTypes: [] });
    await (component as any).initData();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toBe('Unable to load workspace types');
    expect(component.workspaceApps.map(item => item.name)).toEqual(['configured', 'server']);
  });

  it('evaluates availability from oid and template data', () => {
    component.rdmp = '';
    (component as any).updateAllowAdd();
    expect(component.allowAdd).toBeFalse();

    component.rdmp = 'oid-1';
    component.allowAddTemplate = undefined;
    (component as any).updateAllowAdd();
    expect(component.allowAdd).toBeTrue();

    component.allowAddTemplate = '<%= data.enabled %>';
    (component as any).updateAllowAdd({ enabled: true });
    expect(component.allowAdd).toBeTrue();
    (component as any).updateAllowAdd({ enabled: false });
    expect(component.allowAdd).toBeFalse();

    component.allowAddTemplate = '<% invalid';
    (component as any).updateAllowAdd({});
    expect(component.allowAdd).toBeFalse();
  });

  it('navigates immediately when the form is clean or saving is disabled', async () => {
    component.workspaceApps = [configured];
    component.workspaceApp = configured;
    component.rdmp = 'oid / 1';
    component.allowAdd = true;

    await component.openWorkspace();

    expect(formComponent.changeLocationHref).toHaveBeenCalledWith(
      '/default/default/record/configured/edit?rdmp=oid%20%2F%201'
    );

    formComponent.form.dirty = true;
    component.shouldSaveForm = false;
    await component.openWorkspace(configured);
    expect(formComponent.changeLocationHref).toHaveBeenCalledTimes(2);
  });

  it('requests a save and launches only after a successful save event', async () => {
    const publish = spyOn(eventBus, 'publish').and.callThrough();
    component.workspaceApp = configured;
    component.rdmp = 'old-oid';
    component.allowAdd = true;
    component.name = 'workspace';
    formComponent.form.dirty = true;
    await (component as any).initEventHandlers();

    await component.openWorkspace();

    expect(component.launchPending).toBeTrue();
    expect(publish).toHaveBeenCalledWith(
      jasmine.objectContaining({ sourceId: 'workspace', enabledValidationGroups: ['default'] })
    );
    eventBus.publish(createFormSaveSuccessEvent({ oid: 'new-oid', savedData: {} } as any));
    expect(formComponent.changeLocationHref).toHaveBeenCalledWith(
      '/default/default/record/configured/edit?rdmp=new-oid'
    );
    expect(component.launchPending).toBeFalse();

    component.launchPending = true;
    (component as any).pendingWorkspace = configured;
    eventBus.publish(createFormSaveFailureEvent());
    expect(component.launchPending).toBeFalse();
  });

  it('ignores unavailable, external, disabled, readonly, pending, and unsaved launches', async () => {
    component.rdmp = 'oid-1';
    component.allowAdd = false;
    await component.openWorkspace(configured);
    component.allowAdd = true;
    await component.openWorkspace({ ...configured, externallyProvisioned: true });
    component.launchPending = true;
    await component.openWorkspace(configured);
    component.launchPending = false;
    component.rdmp = '';
    await component.openWorkspace(configured);
    await component.openWorkspace(undefined);

    expect(formComponent.changeLocationHref).not.toHaveBeenCalled();
  });

  it('translates labels and unsubscribes on destroy', () => {
    const translationService = (component as any).translationService;
    spyOn(translationService, 't').and.returnValue('Translated');
    expect(component.translate('@workspace')).toBe('Translated');
    expect(component.translate()).toBe('Translated');

    const unsubscribe = spyOn((component as any).subscriptions, 'unsubscribe');
    component.ngOnDestroy();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
