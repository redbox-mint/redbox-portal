import { PartyImportComponent } from './party-import.component';
import { SortComponent } from './sort/sort.component';
import { CommonModule } from '@angular/common';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import {
  AdminAutoFilterDirective,
  AdminCountPipe,
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

  it('escapes admin party names before the template links them to the record view', () => {
    const component = create();
    component.adminParties = true;
    const rows = [{ title: 'Name', variable: 'metadata.fullName', template: '<a href="/record/view/r1">Name</a>' }];
    const result = (component as any).renderRow('draft', rows, 'rowConfig', { metadata: { fullName: 'A <B>' } });
    expect(result['metadata.fullName']).toBe('A &lt;B&gt;');
    component.adminParties = false;
    (component as any).renderRow('draft', rows, 'rowConfig', {});
    expect(templates.compileAndRunTemplate).toHaveBeenCalled();
  });

  it('formats standard admin date columns by their template input and preserves custom and non-admin templates', () => {
    const component = create();
    const rows = [
      { title: 'Created', variable: 'metaMetadata.createdOn', template: '{{formatDateLocale dateCreated "DATETIME_MED"}}' },
      { title: 'Custom', variable: 'custom', template: 'Created: {{formatDateLocale dateCreated "DATETIME_MED"}}' }
    ];
    const imports = { dateCreated: '2026-11-05T18:36:00' };
    templates.compileAndRunTemplate.and.returnValue('Configured template');
    component.adminParties = true;
    const admin = (component as any).renderRow('draft', rows, 'rowConfig', imports);
    expect(admin['metaMetadata.createdOn']).toBe('05/11/2026 18:36');
    expect(admin.custom).toBe('Configured template');
    component.adminParties = false;
    const ordinary = (component as any).renderRow('draft', rows, 'rowConfig', imports);
    expect(ordinary['metaMetadata.createdOn']).toBe('Configured template');
  });

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
      declarations: [DashboardComponent, SortComponent],
      imports: [AdminAutoFilterDirective, AdminCountPipe, PartyImportComponent, CommonModule, FormsModule, I18NextPipe, PaginationModule.forRoot()],
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

    it('uses independent page sizes on initial load, page changes and search, defaulting legacy stages to 10', async () => {
      const snapshot = await recordService.getDashboardSettings();
      snapshot.targets.draft.settings.rowsPerPage = 25;
      const component = create();
      await init(component);
      expect(recordService.getRecords.calls.argsFor(0)[9]).toBe(25);
      expect(recordService.getRecords.calls.argsFor(1)[9]).toBe(10);
      expect(component.getRowsPerPage('draft')).toBe(25);
      expect(component.getRowsPerPage('review')).toBe(10);
      await component.pageChanged({ page: 2, itemsPerPage: 25 }, 'draft');
      expect(recordService.getRecords.calls.mostRecent().args[2]).toBe(2);
      expect(recordService.getRecords.calls.mostRecent().args[9]).toBe(25);
      await component.filterChanged('draft');
      expect(recordService.getRecords.calls.mostRecent().args[2]).toBe(1);
      expect(recordService.getRecords.calls.mostRecent().args[9]).toBe(25);
      component.records.draft = { totalItems: 60, currentPage: 2, items: Array(25) };
      expect(component.partyPageStart('draft')).toBe(26);
      expect(component.partyPageEnd('draft')).toBe(50);
    });

    it('binds each real paginator to its target page size', async () => {
      const snapshot = await recordService.getDashboardSettings();
      snapshot.targets.draft.settings.rowsPerPage = 25;
      const fixture = TestBed.createComponent(DashboardComponent);
      const component = fixture.componentInstance;
      component.recordType = 'rdmp';
      component.dashboardTypeSelected = 'standard';
      (TestBed.inject(UserService) as any).getInfo = jasmine.createSpy().and.resolveTo({});
      recordService.getRecords.and.resolveTo({ ...records, totalItems: 60 });
      fixture.detectChanges();
      await component.waitForInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const pages = fixture.nativeElement.querySelectorAll('pagination');
      expect(pages[0].querySelectorAll('.pagination-page').length).toBe(3);
      expect(pages[1].querySelectorAll('.pagination-page').length).toBe(6);
      fixture.destroy();
    });

    it('uses the active portal base for party View links after component initialization', async () => {
      recordService.brandingAndPortalUrl = 'https://example.test/custom/portal';
      (TestBed.inject(UserService) as any).getInfo = jasmine.createSpy().and.resolveTo({});
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.componentInstance.adminParties = true;
      fixture.componentInstance.recordType = 'rdmp';
      fixture.detectChanges();
      await fixture.componentInstance.waitForInit();
      expect(fixture.componentInstance.records.draft.items[0].adminRecordUrl).toBe('https://example.test/custom/portal/record/view/r1');
      const component = fixture.componentInstance;
      component.tableConfig['draft'] = [{ variable: 'metadata.fullName', title: 'Name', template: '' }];
      component.records.draft.items[0]['metadata.fullName'] = 'Party name';
      fixture.detectChanges();
      const links = fixture.nativeElement.querySelector('tbody tr').querySelectorAll('a');
      expect(links.length).toBe(2);
      expect(links[0].textContent).toBe('Party name');
      expect(links[0].getAttribute('href')).toBe(links[1].getAttribute('href'));
      fixture.destroy();
    });

    it('retains the latest party results when an older search finishes last and supplies record links', async () => {
      const component = create();
      component.adminParties = true;
      (component as any).brandingAndPortalUrl = '/default/rdmp';
      await init(component);
      let older: (result: any) => void = () => {};
      recordService.getRecords.and.returnValues(new Promise(resolve => older = resolve), Promise.resolve({ ...records, items: [{ ...records.items[0], oid: 'new/id' }] }));
      component.filterSearchString.draft = 'older';
      const first = component.filterChanged('draft');
      component.filterSearchString.draft = 'newer';
      await component.filterChanged('draft');
      expect(component.records.draft.items[0].adminRecordUrl).toBe('/default/rdmp/record/view/new%2Fid');
      older(records);
      await first;
      expect(component.records.draft.items[0].adminRecordUrl).toContain('new%2Fid');
    });

    it('submits admin party name and email searches through the existing record query', async () => {
      const component = create();
      component.adminParties = true;
      recordService.getWorkflowSteps.and.resolveTo([{ name: 'draft', config: { workflow: { stage: 'draft', stageLabel: 'Draft' }, displayIndex: 1 } }]);
      recordService.getDashboardSettings.and.resolveTo({
        revision: 7,
        targets: { draft: { settings: settings('Party', { formatRules: { queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title' }] }] } } }), fingerprint: 'fp-party' } },
      });
      await init(component);
      expect(component.getFilterFieldPath('draft')).toBe('metadata.fullName,metadata.email');
      expect(component.getTextFilters('draft').map(field => field.path)).toEqual(['metadata.fullName,metadata.email', 'metadata.fullName', 'metadata.email']);
      component.filterSearchString['draft'] = 'zoe';
      await component.filterChanged('draft');
      expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.fullName,metadata.email', 'zoe', 'any']);
      component.selectAdminFilter('draft', 'metadata.email');
      component.filterSearchString['draft'] = 'zoe@example.edu';
      await component.filterChanged('draft');
      expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.email', 'zoe@example.edu', '']);
      await component.resetFilterAndSearch('draft', { preventDefault() {} });
      expect(component.getFilterFieldPath('draft')).toBe('metadata.fullName,metadata.email');
    });

    it('retains its stage snapshot and resets the actual paginator after a failed page then retries', async () => {
      const config = TestBed.inject(ConfigService) as any;
      config.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
      const fixture = TestBed.createComponent(DashboardComponent);
      const component = fixture.componentInstance;
      component.recordType = 'rdmp';
      component.dashboardTypeSelected = 'standard';
      (TestBed.inject(UserService) as any).getInfo = jasmine.createSpy('getInfo').and.resolveTo({ user: { email: 'me@example.org' } });
      fixture.detectChanges();
      await component.waitForInit();
      const previous = component.records['draft'];
      previous.totalItems = 30;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const activePage = () => fixture.nativeElement.querySelector('pagination .pagination-page.active')?.textContent.trim();
      const page = (value: number) => Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>).find(a => a.textContent?.trim() === String(value))!;
      recordService.getRecords.and.rejectWith({ status: 500 });
      page(2).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.records['draft']).toBe(previous);
      expect(activePage()).toBe('1');
      expect(component.loadError).toContain('Unable to load');
      recordService.getRecords.and.resolveTo({ ...records, currentPage: 2, totalItems: 30 });
      await component.retryLoad();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(activePage()).toBe('2');
      expect(component.loadError).toBe('');
      fixture.destroy();
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

    it('does not submit text merely typed into the search box during page or sort changes', async () => {
      const component = create();
      await init(component);

      component.filterSearchString['draft'] = 'first search';
      await component.pageChanged({ page: 2 } as any, 'draft');
      expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.owner', 'mine', 'equal']);

      await component.filterChanged('draft');
      expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.title', 'first search', '']);

      component.filterSearchString['draft'] = 'still typing';
      await component.sortChanged({ step: 'draft', variable: 'metadata.title', sort: 'asc', secondarySort: '' });
      expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.title', 'first search', '']);

      await component.resetFilterAndSearch('draft', { preventDefault() {} });
      expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.title', '', '']);
      await component.pageChanged({ page: 2 } as any, 'draft');
      expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metadata.title', '', '']);
    });

    it('reloads settings and templates together once when the templates no longer match', async () => {
      templates.loadDashboardTargetTemplates.and.returnValues(Promise.resolve(false), Promise.resolve(true), Promise.resolve(true), Promise.resolve(true));
      const component = create();
      await init(component);
      expect(recordService.getDashboardSettings).toHaveBeenCalledTimes(2);
    });

    it('shows settings unavailable when templates still fail after reloading', async () => {
      templates.loadDashboardTargetTemplates.and.resolveTo(false);
      const component = create();
      await init(component);

      expect(recordService.getDashboardSettings).toHaveBeenCalledTimes(2);
      expect(component.settingsUnavailable).toBeTrue();
      expect(component.workflowSteps).toEqual([]);
      expect(component.stepState).toEqual({});
      expect(component.tableConfig).toEqual({});
      expect(recordService.getRecords).not.toHaveBeenCalled();
    });

    it('does not silently omit a stage missing from the settings snapshot', async () => {
      recordService.getDashboardSettings.and.resolveTo({ revision: 7, targets: { draft: { settings: settings('Draft'), fingerprint: 'fp-draft' } } });
      const component = create();
      await init(component);

      expect(component.settingsUnavailable).toBeTrue();
      expect(component.workflowSteps).toEqual([]);
      expect(recordService.getRecords).not.toHaveBeenCalled();
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
    await component.pageChanged({ page: 2 } as any, 'existing-locations-draft');
    expect(recordService.getRecords.calls.mostRecent().args.slice(5, 8)).toEqual(['metaMetadata.status', 'published', 'equal']);
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
          }, { searchable: false, rowsPerPage: 50 }),
          fingerprint: 'v',
        },
      },
    });
    const component = create();
    await init(component);
    expect(recordService.getDashboardSettings).toHaveBeenCalledWith('view', 'consolidated');
    expect(templates.loadDashboardTargetTemplates).toHaveBeenCalledWith('default', 'rdmp', { kind: 'view', view: 'consolidated', step: 'main' }, 'v');
    expect(recordService.getRecords.calls.allArgs().every((args: any[]) => args[9] === 50)).toBeTrue();
    // One record row plus one group row.
    expect(component.records['main'].items.length).toBe(2);
    expect(component.records['main'].items[1]['g']).toContain('default|view|consolidated|main|v|groupRowConfig|0|g');
    expect(component.enableSort).toBeFalse();
    expect(component.isSearchEnabled('main')).toBeFalse();
  });

  it('does not render custom view rows when their templates cannot be loaded', async () => {
    attributes = { dashboardView: 'consolidated', dashboardType: 'consolidated' };
    recordService.getDashboardView.and.resolveTo({ name: 'consolidated', titleLabelKey: 'c', dashboardType: 'consolidated', sourceRecordType: 'rdmp', steps: [{ name: 'main', sourceRecordType: 'rdmp', fetchMode: 'allForRecordType' }] });
    recordService.getDashboardSettings.and.resolveTo({ revision: 1, targets: { main: { settings: settings('Title'), fingerprint: 'v' } } });
    templates.loadDashboardTargetTemplates.and.resolveTo(false);

    const component = create();
    await init(component);

    expect(component.settingsUnavailable).toBeTrue();
    expect(component.workflowSteps).toEqual([]);
    expect(recordService.getRecords).not.toHaveBeenCalled();
  });
  it('shows only the active column direction when multiple initial directions are configured', () => {
    const component = create();
    const rows = [{ variable: 'title' }, { variable: 'email' }];
    component.tableConfig['draft'] = rows as any;
    component.sortMap['draft'] = {
      title: { sort: 'desc' }, email: { sort: 'asc', defaultSort: true }
    };
    const step = { name: 'draft', config: { workflow: { stage: 'draft' } } };
    expect(component.getSortStateFromSortMap(component.sortMap, step, rows[0])).toBe('');
    expect(component.sortAria(step, rows[0])).toBeNull();
    expect(component.getSortStateFromSortMap(component.sortMap, step, rows[1])).toBe('asc');
    expect(component.sortAria(step, rows[1])).toBe('ascending');
    expect((component as any).getSortStringFromSortMap(component.sortMap['draft'], 'draft', true)).toBe('email:1');
  });

});
