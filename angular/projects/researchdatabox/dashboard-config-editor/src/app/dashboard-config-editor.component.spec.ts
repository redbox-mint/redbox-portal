import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardConfigEditorComponent } from './dashboard-config-editor.component';
import { DashboardConfigApiService, DashboardCopyPreview, DashboardTargetInfo, DashboardTargetSettings, DashboardValidationResult } from './dashboard-config-api.service';
import { LoggerService, TranslationService, ConfigService, UtilityService } from '@researchdatabox/portal-ng-common';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';

@Pipe({ name: 'i18next', standalone: false })
class MockI18NextPipe implements PipeTransform { transform(key: string, options?: any) { return key; } }

class MockLoggerService {
  warn() {}
  error() {}
}
class MockTranslationService {
  t = (key: string) => key;
}
class MockConfigService {}
class MockUtilityService {}
class MockHttpClient {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function settingsWithColumn(title: string): DashboardTargetSettings['settings'] {
  return {
    searchable: true,
    showStageTitle: true,
    tableConfig: {
      rowConfig: [{ title, variable: 'metadata.title', template: '{{metadata.title}}' }],
      rowRulesConfig: [], groupRowConfig: [], groupRowRulesConfig: [], formatRules: {},
    },
  };
}

describe('DashboardConfigEditorComponent', () => {
  let component: DashboardConfigEditorComponent;
  let fixture: ComponentFixture<DashboardConfigEditorComponent>;
  const initialUrl = window.location.href;
  afterEach(() => window.history.replaceState(null, '', initialUrl));

  let api: jasmine.SpyObj<DashboardConfigApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<DashboardConfigApiService>('DashboardConfigApiService', ['applyCopy', 'getSettings', 'getFields', 'validate', 'save', 'getTargets']);
    api.getFields.and.resolveTo({ status: 'complete', recordType: 'rdmp', fields: [], openPrefixes: [] });
    await TestBed.configureTestingModule({
      declarations: [DashboardConfigEditorComponent, MockI18NextPipe],
      imports: [FormsModule, A11yModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: DashboardConfigApiService, useValue: api },
        { provide: LoggerService, useClass: MockLoggerService },
        { provide: TranslationService, useClass: MockTranslationService },
        { provide: ConfigService, useClass: MockConfigService },
        { provide: UtilityService, useClass: MockUtilityService },
        { provide: HttpClient, useClass: MockHttpClient },
        { provide: APP_BASE_HREF, useValue: '/' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardConfigEditorComponent);
    component = fixture.componentInstance;
    spyOn(component, 'waitForDeps').and.resolveTo();
  });

  it('humanizes untranslated target IDs while preserving the raw identifier', () => {
    const workflow: DashboardTargetInfo = { target: { kind: 'workflow', recordType: 'concurrencyTest', stage: 'draft' }, key: 'test', ownerLabel: 'concurrencyTest', stepLabel: 'draft', hidden: false, recordType: 'concurrencyTest', queryFilterKeys: [] };
    expect(component.targetLabel(workflow)).toBe('Concurrency test · Draft');
    expect(component.targetId(workflow)).toBe('concurrencyTest');
    expect(component.targetLabel({ ...workflow, target: { kind: 'view', view: 'existing-locations', step: 'draft' }, ownerLabel: 'existing-locations' })).toBe('Existing locations · Draft');
    const translations = TestBed.inject(TranslationService) as any;
    translations.t = (key: string) => key === 'concurrencyTest-name' ? 'Concurrency checks' : key;
    expect(component.targetLabel(workflow)).toBe('Concurrency checks · Draft');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the newest selected target when settings requests finish out of order', async () => {
    const firstTarget: DashboardTargetInfo = {
      target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, key: 'draft',
      ownerLabel: 'RDMP', stepLabel: 'Draft', hidden: false, recordType: 'rdmp', queryFilterKeys: [],
    };
    const secondTarget: DashboardTargetInfo = {
      ...firstTarget, target: { kind: 'workflow', recordType: 'rdmp', stage: 'review' }, key: 'review', stepLabel: 'Review',
    };
    const first = deferred<DashboardTargetSettings>();
    const second = deferred<DashboardTargetSettings>();
    api.getSettings.and.returnValues(first.promise, second.promise);

    const selectFirst = component.selectTarget(firstTarget, true);
    const selectSecond = component.selectTarget(secondTarget, true);
    second.resolve({ target: secondTarget.target, settings: {
      searchable: false, showStageTitle: true,
      tableConfig: { rowConfig: [], rowRulesConfig: [], groupRowConfig: [], groupRowRulesConfig: [], formatRules: {} },
    }, revision: 7, schemaVersion: 1, hidden: false });
    await selectSecond;
    first.resolve({ target: firstTarget.target, settings: {
      searchable: true, showStageTitle: true,
      tableConfig: { rowConfig: [], rowRulesConfig: [], groupRowConfig: [], groupRowRulesConfig: [], formatRules: {} },
    }, revision: 6, schemaVersion: 1, hidden: false });
    await selectFirst;

    expect(component.selected).toBe(secondTarget);
    expect(component.draft?.searchable).toBeFalse();
    expect(component.baseRevision).toBe(7);
    expect(component.isDirty).toBeFalse();
    expect(component.loading).toBeFalse();
  });

  it('does not save a different target when selection changes during validation', async () => {
    const firstTarget: DashboardTargetInfo = {
      target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, key: 'draft',
      ownerLabel: 'RDMP', stepLabel: 'Draft', hidden: false, recordType: 'rdmp', queryFilterKeys: [],
    };
    const secondTarget: DashboardTargetInfo = {
      ...firstTarget, target: { kind: 'workflow', recordType: 'rdmp', stage: 'review' }, key: 'review', stepLabel: 'Review',
    };
    const firstSettings: DashboardTargetSettings['settings'] = {
      searchable: true, showStageTitle: true,
      tableConfig: { rowConfig: [], rowRulesConfig: [], groupRowConfig: [], groupRowRulesConfig: [], formatRules: {} },
    };
    const secondSettings = { ...firstSettings, searchable: false };
    const validation = deferred<DashboardValidationResult>();
    api.validate.and.returnValue(validation.promise);
    api.getSettings.and.resolveTo({ target: secondTarget.target, settings: secondSettings, revision: 6, schemaVersion: 1, hidden: false });
    component.selected = firstTarget;
    component.draft = firstSettings;
    component['savedJson'] = JSON.stringify(firstSettings);
    component.baseRevision = 5;

    const saving = component.save();
    await component.selectTarget(secondTarget, true);
    validation.resolve({ target: firstTarget.target, expectedRevision: 5, errors: [], warnings: [], validationFingerprint: 'validated' });
    await saving;

    expect(api.save).not.toHaveBeenCalled();
    expect(component.selected).toBe(secondTarget);
    expect(component.draft?.searchable).toBeFalse();
    expect(component.baseRevision).toBe(6);
  });

  it('ignores a copy-from source response after the administrator selects another source', async () => {
    const destination: DashboardTargetInfo = {
      target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, key: 'draft',
      ownerLabel: 'RDMP', stepLabel: 'Draft', hidden: false, recordType: 'rdmp', queryFilterKeys: [],
    };
    const firstSource: DashboardTargetInfo = {
      ...destination, target: { kind: 'workflow', recordType: 'rdmp', stage: 'review' }, key: 'review', stepLabel: 'Review',
    };
    const secondSource: DashboardTargetInfo = {
      ...destination, target: { kind: 'workflow', recordType: 'rdmp', stage: 'complete' }, key: 'complete', stepLabel: 'Complete',
    };
    const first = deferred<DashboardTargetSettings>();
    api.getSettings.and.returnValue(first.promise);
    component.targets = [destination, firstSource, secondSource];
    component.selected = destination;
    component.draft = settingsWithColumn('Draft');
    component.baseRevision = 5;
    component.copyFrom.open = true;
    component.copyFrom.sourceKey = firstSource.key;
    component.copyFrom.selection.columnsAndActions = true;

    const preview = component.previewCopyFrom();
    component.copyFrom.sourceKey = secondSource.key;
    component.resetCopyFromPreview();
    first.resolve({ target: firstSource.target, settings: settingsWithColumn('Review'), revision: 5, schemaVersion: 1, hidden: false });
    await preview;

    expect(component.copyFrom.candidate).toBeNull();
    expect(component.copyFrom.loading).toBeFalse();
    expect(api.validate).not.toHaveBeenCalled();

    api.getSettings.and.resolveTo({ target: secondSource.target, settings: settingsWithColumn('Complete'), revision: 5, schemaVersion: 1, hidden: false });
    api.validate.and.resolveTo({ target: destination.target, expectedRevision: 5, errors: [], warnings: [], validationFingerprint: 'validated' });
    await component.previewCopyFrom();
    expect(component.copyFrom.candidate?.tableConfig.rowConfig[0].title).toBe('Complete');
    component.applyCopyFrom();
    expect(component.draft?.tableConfig.rowConfig[0].title).toBe('Complete');
    expect(component.message).toContain('Complete');
  });

  it('ignores copy-from validation after the source changes', async () => {
    const destination: DashboardTargetInfo = {
      target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, key: 'draft',
      ownerLabel: 'RDMP', stepLabel: 'Draft', hidden: false, recordType: 'rdmp', queryFilterKeys: [],
    };
    const source: DashboardTargetInfo = {
      ...destination, target: { kind: 'workflow', recordType: 'rdmp', stage: 'review' }, key: 'review', stepLabel: 'Review',
    };
    const validation = deferred<DashboardValidationResult>();
    api.getSettings.and.resolveTo({ target: source.target, settings: settingsWithColumn('Review'), revision: 5, schemaVersion: 1, hidden: false });
    api.validate.and.returnValue(validation.promise);
    component.targets = [destination, source];
    component.selected = destination;
    component.draft = settingsWithColumn('Draft');
    component.baseRevision = 5;
    component.copyFrom.open = true;
    component.copyFrom.sourceKey = source.key;
    component.copyFrom.selection.columnsAndActions = true;

    const preview = component.previewCopyFrom();
    await Promise.resolve();
    expect(api.validate).toHaveBeenCalled();
    expect(component.copyFrom.candidate).toBeNull();
    component.copyFrom.sourceKey = '';
    component.resetCopyFromPreview();
    validation.resolve({ target: destination.target, expectedRevision: 5, errors: [], warnings: [], validationFingerprint: 'validated' });
    await preview;

    expect(component.copyFrom.candidate).toBeNull();
    expect(component.copyFrom.loading).toBeFalse();
    expect(component.copyFrom.errors).toEqual([]);
  });

  it('keeps the loaded source draft at the revision returned by an atomic copy', async () => {
    const source = { kind: 'workflow', recordType: 'rdmp', stage: 'draft' } as const;
    const destination = { kind: 'workflow', recordType: 'rdmp', stage: 'review' } as const;
    const selected: DashboardTargetInfo = {
      target: source,
      key: 'workflow:rdmp:draft',
      ownerLabel: 'RDMP',
      stepLabel: 'Draft',
      hidden: false,
      recordType: 'rdmp',
      queryFilterKeys: [],
    };
    const loadedDraft = {
      searchable: true,
      showStageTitle: true,
      tableConfig: {
        rowConfig: [],
        rowRulesConfig: [],
        groupRowConfig: [],
        groupRowRulesConfig: [],
        formatRules: {},
      },
    };
    const preview: DashboardCopyPreview = {
      expectedRevision: 5,
      previewFingerprint: 'preview-fingerprint',
      source,
      destinations: [destination],
      groups: ['columnsAndActions'],
      changes: [],
      errors: [],
      warnings: [],
    };
    component.selected = selected;
    component.draft = JSON.parse(JSON.stringify(loadedDraft));
    component['savedJson'] = JSON.stringify(component.draft);
    component.baseRevision = 5;
    component.copyTo.open = true;
    component.copyTo.preview = preview;
    api.applyCopy.and.resolveTo({ updated: 1, revision: 6 });

    await component.applyCopyTo();

    expect(component.baseRevision).toBe(6);
    expect(component.draft).toEqual(loadedDraft);
    expect(component.isDirty).toBe(false);
    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it('does not advance a stale source draft after a copy based on a newer preview', async () => {
    const source = { kind: 'workflow', recordType: 'rdmp', stage: 'draft' } as const;
    const selected: DashboardTargetInfo = {
      target: source, key: 'draft', ownerLabel: 'RDMP', stepLabel: 'Draft', hidden: false,
      recordType: 'rdmp', queryFilterKeys: [],
    };
    component.selected = selected;
    component.draft = {
      searchable: true, showStageTitle: true,
      tableConfig: { rowConfig: [], rowRulesConfig: [], groupRowConfig: [], groupRowRulesConfig: [], formatRules: {} },
    };
    component['savedJson'] = JSON.stringify(component.draft);
    component.baseRevision = 5;
    component.copyTo.open = true;
    component.copyTo.preview = {
      expectedRevision: 6, previewFingerprint: 'newer-preview', source,
      destinations: [{ kind: 'workflow', recordType: 'rdmp', stage: 'review' }],
      groups: ['columnsAndActions'], changes: [], errors: [], warnings: [],
    };
    api.applyCopy.and.resolveTo({ updated: 1, revision: 7 });

    await component.applyCopyTo();

    expect(component.baseRevision).toBe(5);
    expect(component.draft.searchable).toBeTrue();
    expect(component.staleConflict).toBeTrue();
    expect(component.error).toContain('Reload saved settings');
    expect(api.getSettings).not.toHaveBeenCalled();

    component.draft.searchable = false;
    api.validate.and.rejectWith(new Error('stale revision'));
    await component.save();
    expect(api.validate).toHaveBeenCalledWith(source, 5, component.draft);
  });

  it('shows the legacy default without dirtying the draft and saves a numeric page size', async () => {
    const info: DashboardTargetInfo = { target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, key: 'draft', ownerLabel: 'Plan', stepLabel: 'Draft', hidden: false, recordType: 'rdmp', queryFilterKeys: [] };
    const original = settingsWithColumn('Title');
    api.getSettings.and.resolveTo({ target: info.target, settings: original, revision: 2, schemaVersion: 1, hidden: false });
    api.getTargets.and.resolveTo({ targets: [info], catalogueFingerprint: 'f' });
    await component['initComponent']();
    await component.selectTarget(info, true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#dc-rows-per-page');
    expect(select.options[select.selectedIndex].textContent).toBe('10');
    expect(component.isDirty).toBeFalse();
    expect(Object.hasOwn(component.draft!, 'rowsPerPage')).toBeFalse();
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.draft?.rowsPerPage).toBe(25);
    expect(component.isDirty).toBeTrue();
    api.validate.and.resolveTo({ errors: [], warnings: [], validationFingerprint: 'v' } as any);
    api.save.and.resolveTo({ target: info.target, settings: { ...original, rowsPerPage: 25 }, revision: 3, schemaVersion: 1, hidden: false });
    await component.save();
    expect(api.save.calls.mostRecent().args[1].settings.rowsPerPage).toBe(25);
    expect(api.save.calls.mostRecent().args[1].expectedRevision).toBe(2);
    expect(component.isDirty).toBeFalse();
  });

  it('starts with a choice of targets and does not load or save an arbitrary dashboard', async () => {
    window.history.replaceState(null, '', window.location.pathname);
    api.getTargets.and.resolveTo({ targets: [], catalogueFingerprint: 'targets' });
    await component['initComponent']();
    expect(component.selected).toBeNull();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-admin-empty h3')?.textContent).toContain('admin-dashboard-pick');
    expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1);
  });

  it('retries metadata loading after a failure', async () => {
    window.history.replaceState(null, '', window.location.pathname);
    api.getTargets.and.rejectWith(new Error('Metadata unavailable'));
    await component['initComponent']();
    expect(component.targetsError).toContain('Metadata unavailable');
    expect(component.targetsLoading).toBeFalse();
    api.getTargets.and.resolveTo({ targets: [], catalogueFingerprint: 'targets' });
    await component.retry();
    expect(component.targetsError).toBe('');
    expect(api.getTargets).toHaveBeenCalledTimes(2);
  });

  it('discards only local edits and protects navigation while dirty', () => {
    component.draft = settingsWithColumn('Saved title');
    component['savedJson'] = JSON.stringify(component.draft);
    component.draft.tableConfig.rowConfig[0].title = 'Edited title';
    component.draft.tableConfig['extraSetting'] = { preserve: true };
    expect(component.isDirty).toBeTrue();
    const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.onBeforeUnload(unload);
    expect(unload.defaultPrevented).toBeTrue();
    const anchor = document.createElement('a');
    anchor.href = '/admin';
    const event = new MouseEvent('click', { cancelable: true, button: 0 });
    Object.defineProperty(event, 'target', { value: anchor });
    component.confirmNavigation(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(component.pendingLeave).toBe(anchor.href);
    component.cancelLeave();
    component.discard();
    expect(component.draft?.tableConfig.rowConfig[0].title).toBe('Saved title');
    expect(component.isDirty).toBeFalse();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('keeps the editor path when selecting a target under the portal base href', () => {
    const target: DashboardTargetInfo = { target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, key: 'draft', ownerLabel: 'RDMP', stepLabel: 'Draft', hidden: false, recordType: 'rdmp', queryFilterKeys: [] };
    window.history.replaceState(null, '', '/default/rdmp/admin/dashboard-config');
    expect(component.targetHash(target)).toBe('/default/rdmp/admin/dashboard-config#target=draft');
  });
});
