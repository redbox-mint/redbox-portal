import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import {
  ConfigService,
  DashboardSettings,
  HandlebarsTemplateService,
  I18NextPipe,
  LoggerService,
  RecordService,
  TranslationService,
  UserService,
  UtilityService,
  getStubConfigService,
  getStubTranslationService,
  getStubUserService,
} from '@researchdatabox/portal-ng-common';

function settings(title: string, extra: Partial<DashboardSettings['tableConfig']> = {}, flags: Partial<DashboardSettings> = {}): DashboardSettings {
  return {
    searchable: true,
    showStageTitle: true,
    ...flags,
    tableConfig: {
      rowConfig: [{ title, variable: 'metadata.title', template: '{{metadata.title}}', initialSort: 'desc', defaultSort: true }],
      rowRulesConfig: [],
      groupRowConfig: [],
      groupRowRulesConfig: [],
      formatRules: {},
      ...extra,
    },
  };
}

const records = {
  items: [{ oid: 'r1', title: 'One', metadata: { metadata: { title: 'One' }, metaMetadata: { type: 'rdmp' }, workflow: { stage: 'draft' } } }],
  totalItems: 1,
  currentPage: 1,
  noItems: 10,
};

describe('DashboardComponent', () => {
  let recordService: jasmine.SpyObj<any>;
  let templates: jasmine.SpyObj<any>;
  let attributes: Record<string, string>;

  function create(): DashboardComponent {
    // The host element's attributes are read in the constructor; set the equivalent fields directly.
    const component = TestBed.createComponent(DashboardComponent).componentInstance;
    component.recordType = attributes['recordType'] ?? '';
    component.packageType = attributes['packageType'] ?? '';
    component.dashboardView = attributes['dashboardView'] ?? '';
    component.dashboardTypeSelected = attributes['dashboardType'] || 'standard';
    return component;
  }

  async function init(component: DashboardComponent) {
    (component as any).branding = 'default';
    (component as any).portal = 'rdmp';
    (component as any).currentUser = { user: { email: 'me@example.org' } };
    if (component.dashboardView) {
      await component.initDashboardView(component.dashboardView);
    } else {
      await component.initView(component.recordType);
    }
  }

  beforeEach(async () => {
    attributes = { recordType: 'rdmp', dashboardType: 'standard' };
    recordService = jasmine.createSpyObj('RecordService', ['getDashboardType', 'getDashboardSettings', 'getWorkflowSteps', 'getRecords', 'getRelatedRecords', 'getDashboardView', 'getConfig', 'waitForInit', 'isInitializing']);
    recordService.waitForInit.and.returnValue(recordService);
    recordService.isInitializing.and.returnValue(false);
    recordService.getConfig.and.returnValue({ branding: 'default', portal: 'rdmp', baseUrl: '' });
    recordService.getDashboardType.and.resolveTo({ name: 'standard', formatRules: {} });
    recordService.getWorkflowSteps.and.resolveTo([
      { name: 'review', config: { workflow: { stage: 'review', stageLabel: 'Review' }, displayIndex: 2 } },
      { name: 'draft', config: { workflow: { stage: 'draft', stageLabel: 'Draft' }, displayIndex: 1 } },
    ]);
    recordService.getRecords.and.resolveTo(records);
    templates = jasmine.createSpyObj('HandlebarsTemplateService', ['loadDashboardTargetTemplates', 'buildDashboardTemplateKeyPrefix', 'compileAndRunTemplate', 'waitForInit', 'isInitializing']);
    templates.loadDashboardTargetTemplates.and.resolveTo(true);
    templates.buildDashboardTemplateKeyPrefix.and.callFake((b: string, t: any, fp: string) => [b, t.kind, t.recordType ?? t.view, t.stage ?? t.step, fp]);
    templates.compileAndRunTemplate.and.callFake((_tpl: string, ctx: any, key: string[]) => `${key.join('|')}:${ctx?.metadata?.title ?? ''}`);

    await TestBed.configureTestingModule({
      declarations: [DashboardComponent],
      imports: [FormsModule, I18NextPipe],
      providers: [
        { provide: APP_BASE_HREF, useValue: 'base' },
        LoggerService,
        UtilityService,
        { provide: TranslationService, useValue: getStubTranslationService() },
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: RecordService, useValue: recordService },
        { provide: UserService, useValue: getStubUserService('user', 'pw') },
        { provide: HandlebarsTemplateService, useValue: templates },
      ],
    }).compileComponents();
  });

  describe('workflow stage dashboards', () => {
    beforeEach(() => {
      recordService.getDashboardSettings.and.resolveTo({
        revision: 7,
        targets: {
          draft: { settings: settings('Draft title', { formatRules: { filterBy: { filterBase: 'record', filterBaseFieldOrValue: 'mine', filterField: 'metadata.owner', filterMode: 'equal' } } }), fingerprint: 'fp-draft' },
          review: { settings: settings('Review title', {}, { searchable: false, showStageTitle: false }), fingerprint: 'fp-review' },
        },
      });
    });

    it('loads each stage from one settings snapshot and pins templates to its fingerprint', async () => {
      const component = create();
      await init(component);

      expect(recordService.getDashboardSettings).toHaveBeenCalledOnceWith('workflow', 'rdmp');
      expect(component.workflowSteps.map((s: any) => s.name)).toEqual(['draft', 'review']);
      expect(templates.loadDashboardTargetTemplates).toHaveBeenCalledWith('default', 'rdmp', { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, 'fp-draft');
      expect(component.tableConfig['draft'][0].title).toBe('Draft title');
      expect(component.tableConfig['review'][0].title).toBe('Review title');
      expect(component.records['draft'].items[0]['metadata.title']).toBe('default|workflow|rdmp|draft|fp-draft|rowConfig|0|metadata.title:One');
    });

    it('keeps each stage\'s filter, search and title settings to itself', async () => {
      const component = create();
      await init(component);

      const calls = recordService.getRecords.calls.all().map((c: any) => c.args);
      const draftCall = calls.find((a: any[]) => a[1] === 'draft');
      const reviewCall = calls.find((a: any[]) => a[1] === 'review');
      expect(draftCall.slice(5, 8)).toEqual(['metadata.owner', 'mine', 'equal']);
      // The review stage has no filter even though draft was initialised first.
      expect(reviewCall.slice(5, 8)).toEqual([undefined, undefined, undefined]);
      expect(component.isSearchEnabled('draft')).toBeTrue();
      expect(component.isSearchEnabled('review')).toBeFalse();
      expect(component.isStageTitleShown('draft')).toBeTrue();
      expect(component.isStageTitleShown('review')).toBeFalse();
    });

    it('reloads settings and templates together once when the templates no longer match', async () => {
      templates.loadDashboardTargetTemplates.and.returnValues(Promise.resolve(false), Promise.resolve(true), Promise.resolve(true), Promise.resolve(true));
      const component = create();
      await init(component);
      expect(recordService.getDashboardSettings).toHaveBeenCalledTimes(2);
    });

    it('uses the column sort first, then the stage overall sort', async () => {
      const component = create();
      await init(component);
      expect((component as any).getSortStringFromSortMap(component.sortMap['draft'], 'draft', true)).toBe('metadata.title:-1');
      component.stepState['draft'].settings.tableConfig.formatRules.sortBy = 'metaMetadata.createdOn:1';
      expect((component as any).getSortStringFromSortMap({}, 'draft', true)).toBe('metaMetadata.createdOn:1');
      component.stepState['draft'].settings.tableConfig.formatRules.sortBy = undefined;
      expect((component as any).getSortStringFromSortMap({}, 'draft', true)).toBe('metaMetadata.lastSaveDate:-1');
    });

    it('uses the search filter fields and templates of the stage being searched', async () => {
      recordService.getDashboardSettings.and.resolveTo({
        revision: 1,
        targets: {
          draft: { settings: settings('A', { formatRules: { queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Owner', path: 'metadata.owner', template: '{{value}}*' }] }] } } }), fingerprint: 'fa' },
          review: { settings: settings('B'), fingerprint: 'fb' },
        },
      });
      const component = create();
      await init(component);
      expect(component.getFilterFieldName('draft')).toBe('Owner');
      expect(component.getFilterFieldName('review')).toBe('Title');
      component.filterSearchString['draft'] = 'abc';
      component.getFilterSearchString('draft');
      expect(templates.compileAndRunTemplate).toHaveBeenCalledWith('{{value}}*', { value: 'abc' }, ['default', 'workflow', 'rdmp', 'draft', 'fa', 'filters', 'rdmp', '0', 'fields', '0', 'template']);
    });

    it('supplies the stage\'s row rule sets to templates', async () => {
      const component = create();
      await init(component);
      component.stepState['draft'].settings.tableConfig.rowRulesConfig = [{ ruleSetName: 'actions', applyRuleSet: true, separator: ' | ', rules: [{ name: 'Edit', action: 'show', renderItemTemplate: 'edit' }, { name: 'Hide', action: 'show', renderItemTemplate: 'x', evaluateRulesTemplate: 'false' }] }];
      templates.compileAndRunTemplate.and.callFake((tpl: string) => (tpl === 'false' ? 'false' : tpl));
      const rendered = component.evaluateRowLevelRules(component.stepState['draft'].settings.tableConfig.rowRulesConfig, {}, {}, {}, 'r1', 'actions', 'rdmp', 'draft');
      expect(rendered).toBe('edit');
    });
  });

  it('shows an empty-columns state rather than restoring built-in columns', async () => {
    recordService.getWorkflowSteps.and.resolveTo([{ name: 'draft', config: { workflow: { stage: 'draft' } } }]);
    recordService.getDashboardSettings.and.resolveTo({ revision: 1, targets: { draft: { settings: settings('x', { rowConfig: [] }), fingerprint: 'f' } } });
    const component = create();
    await init(component);
    expect(component.tableConfig['draft']).toEqual([]);
  });

  it('uses the workspace context to choose the stage settings and lists records by package type', async () => {
    attributes = { recordType: 'workspace', packageType: 'workspace', dashboardType: 'workspace' };
    recordService.getDashboardType.and.resolveTo({ name: 'workspace', formatRules: { recordTypeFilterBy: 'existing-locations', filterWorkflowStepsBy: ['existing-locations-draft'] } });
    recordService.getWorkflowSteps.and.resolveTo([
      { name: 'existing-locations-draft', config: { workflow: { stage: 'existing-locations-draft' } } },
      { name: 'other', config: { workflow: { stage: 'other' } } },
    ]);
    recordService.getDashboardSettings.and.resolveTo({
      revision: 1,
      targets: {
        'existing-locations-draft': {
          settings: settings('Workspace', {
            formatRules: {
              filterBy: {
                filterBase: 'record',
                filterBaseFieldOrValue: 'published',
                filterField: 'metaMetadata.status',
                filterMode: 'equal',
              },
              queryFilters: {
                workspace: [
                  {
                    filterType: 'text',
                    filterFields: [{ name: 'Title', path: 'metadata.title', template: '', legacyTemplateLookupFailed: true }],
                  },
                ],
              },
            },
          }),
          fingerprint: 'w',
        },
      },
    });
    const component = create();
    await init(component);
    expect(recordService.getDashboardSettings).toHaveBeenCalledWith('workflow', 'existing-locations');
    expect(component.workflowSteps.map((s: any) => s.name)).toEqual(['existing-locations-draft']);
    expect(recordService.getRecords.calls.mostRecent().args.slice(0, 4)).toEqual(['', '', 1, 'workspace']);
    expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metaMetadata.status', 'published', 'equal']);
    expect(component.isStageTitleShown('existing-locations-draft')).toBeFalse();
    component.filterSearchString['existing-locations-draft'] = 'a search term';
    expect(component.getFilterSearchString('existing-locations-draft')).toBe('');
    await component.filterChanged('existing-locations-draft');
    expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.title', '', '']);
  });

  it('renders custom view steps with their own grouping and group rows', async () => {
    attributes = { dashboardView: 'consolidated', dashboardType: 'consolidated' };
    recordService.getDashboardView.and.resolveTo({ name: 'consolidated', titleLabelKey: 'c', dashboardType: 'consolidated', sourceRecordType: 'rdmp', steps: [{ name: 'main', sourceRecordType: 'rdmp', fetchMode: 'allForRecordType' }] });
    recordService.getDashboardSettings.and.resolveTo({
      revision: 1,
      targets: {
        main: {
          settings: settings('Title', {
            groupRowConfig: [{ title: 'Group', variable: 'g', template: 'group' }],
            formatRules: { groupBy: 'groupedByRecordType', sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp', compareField: '', relatedTo: '' }] },
          }, { searchable: false }),
          fingerprint: 'v',
        },
      },
    });
    const component = create();
    await init(component);
    expect(recordService.getDashboardSettings).toHaveBeenCalledWith('view', 'consolidated');
    expect(templates.loadDashboardTargetTemplates).toHaveBeenCalledWith('default', 'rdmp', { kind: 'view', view: 'consolidated', step: 'main' }, 'v');
    // One record row plus one group row.
    expect(component.records['main'].items.length).toBe(2);
    expect(component.records['main'].items[1]['g']).toContain('default|view|consolidated|main|v|groupRowConfig|0|g');
    expect(component.enableSort).toBeFalse();
    expect(component.isSearchEnabled('main')).toBeFalse();
  });
});
