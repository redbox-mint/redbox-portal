import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardConfigEditorComponent } from './dashboard-config-editor.component';
import { DashboardConfigApiService, DashboardCopyPreview, DashboardTargetInfo } from './dashboard-config-api.service';
import { LoggerService, TranslationService, ConfigService, UtilityService } from '@researchdatabox/portal-ng-common';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';

class MockLoggerService {}
class MockTranslationService {
  t = (key: string) => key;
}
class MockConfigService {}
class MockUtilityService {}
class MockHttpClient {}

describe('DashboardConfigEditorComponent', () => {
  let component: DashboardConfigEditorComponent;
  let fixture: ComponentFixture<DashboardConfigEditorComponent>;
  let api: jasmine.SpyObj<DashboardConfigApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<DashboardConfigApiService>('DashboardConfigApiService', ['applyCopy', 'getSettings']);
    await TestBed.configureTestingModule({
      declarations: [DashboardConfigEditorComponent],
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
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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
});
