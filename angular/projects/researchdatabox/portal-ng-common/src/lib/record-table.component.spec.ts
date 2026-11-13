import { AdminPagerComponent } from './admin-pager.component';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgModel, FormsModule } from '@angular/forms';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { RecordPageDto, RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
import { AdminDateService } from './admin-date.service';
import { RecordTableComponent } from './record-table.component';
import { RecordSource } from './record.model';
import { HeaderSortComponent } from './header-sort.component';
import { I18NextPipe } from './i18next.pipe';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import { TranslationService } from './translation.service';
import { HandlebarsTemplateService } from './handlebars-template.service';
import { getStubTranslationService } from './helper.spec';

describe('RecordTableComponent', () => {
  let fixture: ComponentFixture<RecordTableComponent>;
  let component: RecordTableComponent;
  let currentPage: RecordPageDto;
  let source: RecordSource;
  let refresh: jasmine.Spy;
  let renderTemplate: jasmine.Spy;

  beforeEach(async () => {
    refresh = jasmine.createSpy('refreshConfig').and.resolveTo({});
    renderTemplate = jasmine.createSpy('compileAndRunTemplate').and.returnValue('<strong>Rendered title</strong>');
    await TestBed.configureTestingModule({
      declarations: [RecordTableComponent, HeaderSortComponent],
      imports: [AdminPagerComponent, FormsModule, PaginationModule.forRoot(), I18NextPipe],
      providers: [
        { provide: LoggerService, useValue: { error: jasmine.createSpy('error') } },
        { provide: UtilityService, useValue: {} },
        { provide: ConfigService, useValue: { refreshConfig: refresh } },
        { provide: TranslationService, useValue: getStubTranslationService() },
        { provide: HandlebarsTemplateService, useValue: { compileAndRunTemplate: renderTemplate } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RecordTableComponent);
    component = fixture.componentInstance;
    currentPage = { records: [{ title: 'Page one' }], total: 30, pageNum: 1 };
    source = {
      getCurrentPage: () => currentPage,
      gotoPage: jasmine.createSpy('gotoPage').and.callFake(async (pageNum: number) => {
        currentPage = { ...currentPage, pageNum, records: [{ title: `Page ${pageNum}` }] };
        return currentPage;
      }),
      recordTableAction: jasmine.createSpy('recordTableAction').and.resolveTo(),
      headerSortChanged: jasmine.createSpy('headerSortChanged').and.resolveTo()
    };
    component.dataSource = source;
    component.columnConfig = [{ property: 'title', label: 'Title' }] as RecordPropViewMetaDto[];
  });

  it('renders opted-in data columns as literal text while retaining configured HTML templates', async () => {
    (currentPage.records[0] as any).title = '<img src=x onerror=alert(1)>Hello';
    component.plainTextColumns = true;
    await render();
    expect(fixture.nativeElement.querySelector('tbody td').textContent).toBe((currentPage.records[0] as any).title);
    expect(fixture.nativeElement.querySelector('tbody img')).toBeNull();
  });

  afterEach(() => fixture.destroy());

  async function render() {
    fixture.detectChanges();
    await component.waitForInit();
    await settle();
  }

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function pageLink(page: number): HTMLAnchorElement {
    return Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
      .find(link => link.textContent?.trim() === String(page))!;
  }

  function activePage() {
    return fixture.nativeElement.querySelector('pagination .pagination-page.active')?.textContent.trim();
  }

  it('uses previous/next links and caps the last admin page range at the result total', async () => {
    component.adminPresentation = true;
    component.paginationItemsPerPage = 10;
    currentPage = { records: [{ title: 'Last' }], total: 21, pageNum: 3 };
    await render();
    expect(component.adminPageEnd).toBe(21);
    expect(fixture.nativeElement.querySelector('rb-admin-pager .page-link').textContent.trim()).toBe('‹');
    expect(fixture.nativeElement.querySelector('.pagination-first')).toBeNull();
  });

  it('keeps counts without a pager for one admin page and hides an empty footer', async () => {
    component.adminPresentation = true;
    currentPage = { records: [{ title: 'Only row' }], total: 1, pageNum: 1 };
    await render();
    expect(fixture.nativeElement.querySelector('.card-footer')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('pagination')).toBeNull();
    currentPage = { records: [], total: 0, pageNum: 1 };
    await settle();
    expect(fixture.nativeElement.querySelector('.card-footer')).toBeNull();
  });

  it('formats the named-query modified-date envelope using the shared admin locale', async () => {
    const timestamp = '2026-11-05T23:06:12.085Z';
    const format = spyOn(TestBed.inject(AdminDateService), 'format').and.returnValue('06/11/2026 09:36');
    component.adminPresentation = true;
    component.columnConfig = [{ property: 'lastSaveDate', label: 'Date Modified' }] as RecordPropViewMetaDto[];
    currentPage.records = [{ lastSaveDate: timestamp }];
    await render();
    expect(format).toHaveBeenCalledWith(timestamp);
    expect(fixture.nativeElement.textContent).toContain('06/11/2026 09:36');
    expect(fixture.nativeElement.textContent).not.toContain(timestamp);
    format.calls.reset();
    component.adminPresentation = false;
    expect(component.getEntryValue(currentPage.records[0], component.columnConfig[0])).toBe(timestamp);
    expect(format).not.toHaveBeenCalled();
    component.adminPresentation = true;
    component.columnConfig[0].template = '{{lastSaveDate}}';
    expect(component.getEntryValue(currentPage.records[0], component.columnConfig[0])).toContain('Rendered title');
    expect(format).not.toHaveBeenCalled();
  });

  it('restores the loaded selection after a failed request, permits retry, and blocks paging while pending or disabled', async () => {
    await render();
    const loaded = currentPage;
    let finish!: (value: RecordPageDto) => void;
    // Consumers report their own load errors and retain their last successful page.
    // Resolve with that retained page, as Report and Deleted Records do on failure.
    const goto = source.gotoPage as jasmine.Spy;
    goto.and.returnValue(new Promise<RecordPageDto>(resolve => { finish = resolve; }));
    pageLink(2).click();
    fixture.detectChanges();
    expect(component.paginationPending).toBeTrue();
    pageLink(3).click();
    await component.gotoPage(3, fixture.debugElement.query(By.directive(NgModel)).injector.get(NgModel));
    expect(goto.calls.allArgs()).toEqual([[2]]);
    expect(fixture.nativeElement.textContent).toContain('Page one');
    finish(loaded);
    await settle();
    expect(component.paginationPending).toBeFalse();
    expect(activePage()).toBe('1');
    expect(currentPage).toBe(loaded);

    // The same target must be selectable again after NgModel has been reset.
    goto.and.callFake(async (pageNum: number) => {
      currentPage = { ...loaded, pageNum, records: [{ title: 'Page two' }] };
      return currentPage;
    });
    pageLink(2).click();
    await settle();
    expect(goto.calls.allArgs()).toEqual([[2], [2]]);
    expect(activePage()).toBe('2');
    expect(fixture.nativeElement.textContent).toContain('Page two');
    pageLink(2).click();
    await settle();
    await component.gotoPage(2, fixture.debugElement.query(By.directive(NgModel)).injector.get(NgModel));
    expect(goto).toHaveBeenCalledTimes(2);
    component.paginationDisabled = true;
    await settle();
    pageLink(3).click();
    await component.gotoPage(3, fixture.debugElement.query(By.directive(NgModel)).injector.get(NgModel));
    await settle();
    expect(goto).toHaveBeenCalledTimes(2);
    component.paginationDisabled = false;
    await settle();
    pageLink(3).click();
    await settle();
    expect(activePage()).toBe('3');
    expect(goto.calls.mostRecent().args).toEqual([3]);
  });

  it('releases the paginator and restores its selection when a source rejects', async () => {
    await render();
    const goto = source.gotoPage as jasmine.Spy;
    goto.and.rejectWith(new Error('Offline'));
    const paginator = fixture.debugElement.query(By.directive(NgModel));
    await expectAsync(component.gotoPage(2, paginator.injector.get(NgModel))).toBeRejectedWithError('Offline');
    await settle();
    expect(component.paginationPending).toBeFalse();
    expect(activePage()).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('Page one');
  });

  it('propagates missing datasource bootstrap failure and initializes after configuration refresh and corrected input', async () => {
    component.dataSource = null as any;
    const waiting = expectAsync(component.waitForInit()).toBeRejectedWithError('RecordTableComponent is missing a datasource parameter!');
    fixture.detectChanges();
    await waiting;
    expect(component.loadError).toContain('Unable to load');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    component.dataSource = source;
    await component.retryLoad();
    await component.waitForInit();
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(component.loadError).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Page one');
  });

  it('requires a report name for templates and renders the configured template with row and optional data after retry', async () => {
    component.columnConfig = [{ property: 'title', label: 'Title', template: '{{title}}' }] as RecordPropViewMetaDto[];
    component.optTemplateData = { context: 'Report' };
    const waiting = expectAsync(component.waitForInit()).toBeRejectedWithError('RecordTableComponent requires reportName when using Handlebars templates!');
    fixture.detectChanges();
    await waiting;
    component.reportName = 'my-report';
    await component.retryLoad();
    await settle();
    expect(renderTemplate).toHaveBeenCalledWith('{{title}}', jasmine.objectContaining({
      title: 'Page one', optTemplateData: { context: 'Report' }
    }), ['my-report', 'columns', '0', 'render']);
    expect(fixture.nativeElement.querySelector('td strong').textContent).toBe('Rendered title');
  });

  it('renders unsupported server-sort columns as plain headers', async () => {
    component.columnConfig = [
      { label: 'Sortable', property: 'title', sortable: true },
      { label: 'Computed', property: 'computed', sortable: false },
    ] as any;
    component.enableSort = true;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('header-sort').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.record-table-heading-no-sort').textContent).toContain('Computed');
  });

  it('renders multivalue columns and routes row actions and sorting to the source', async () => {
    currentPage.records = [{ title: 'First', tags: ['One', 'Two'] }];
    component.columnConfig = [
      { property: 'title', label: 'Title' },
      { property: 'tags', label: 'Tags', multivalue: true, template: '{{recordTableMeta.val}}' }
    ] as RecordPropViewMetaDto[];
    component.reportName = 'tags-report';
    renderTemplate.and.callFake((_template: string, data: any) => `<span>${data.recordTableMeta.val}</span>`);
    component.enableSort = true;
    component.enableActions = true;
    component.showActions = [{ name: 'view', classes: 'view-record', label: 'View' }];
    await render();
    expect(fixture.nativeElement.textContent).toContain('OneTwo');
    fixture.nativeElement.querySelector('.view-record').click();
    expect(source.recordTableAction).toHaveBeenCalledWith(jasmine.anything(), currentPage.records[0], 'view');
    const headers = fixture.nativeElement.querySelectorAll('header-sort button');
    expect(headers[0].hasAttribute('aria-sort')).toBeFalse();
    expect(headers[0].querySelector('.fa-sort')).toBeTruthy();
    headers[0].click();
    await settle();
    expect(headers[0].closest('th').getAttribute('aria-sort')).toBe('ascending');
    headers[1].click();
    await settle();
    expect(headers[0].closest('th').getAttribute('aria-sort')).toBeNull();
    expect(headers[1].closest('th').getAttribute('aria-sort')).toBe('ascending');
    expect(source.headerSortChanged).toHaveBeenCalledWith(jasmine.objectContaining({ variable: 'tags', sort: 'asc' }), component.columnConfig[1]);
  });
  it('omits empty admin tables while preserving ordinary portal table headers', async () => {
    currentPage = { records: [], total: 0, pageNum: 1 };
    component.adminPresentation = true;
    await render();
    expect(fixture.nativeElement.querySelector('thead')).toBeNull();
    component.adminPresentation = false;
    await settle();
    expect(fixture.nativeElement.querySelector('thead')).toBeTruthy();
  });

});

describe('RecordTableComponent multivalue columns', () => {
  let component: RecordTableComponent;
  const column = { property: 'metadata.funders', multivalue: true } as RecordPropViewMetaDto;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RecordTableComponent],
      providers: [
        { provide: TranslationService, useValue: { t: (key: string) => key } },
        { provide: LoggerService, useValue: {} },
        { provide: UtilityService, useValue: {} },
        { provide: HandlebarsTemplateService, useValue: {} },
      ],
    }).overrideComponent(RecordTableComponent, { set: { template: '' } });
    component = TestBed.createComponent(RecordTableComponent).componentInstance;
  });

  for (const value of [undefined, null, {}, 42, []]) {
    it(`renders an empty cell for ${JSON.stringify(value)} so later report rows can render`, () => {
      expect(component.getColValue({ metadata: { funders: value } }, column)).toBe('');
      spyOn(component, 'getEntryValue').and.callFake((_row, _col, entry) => entry);
      expect(component.getColValue({ metadata: { funders: ['ARC'] } }, column)).toBe('ARC');
    });
  }

  it('renders each array item with its template context', () => {
    spyOn(component, 'getEntryValue').and.callFake((_row, _col, value) => `${value.title}; `);
    expect(component.getColValue({ metadata: { funders: [{ title: 'ARC' }, { title: 'NHMRC' }] } }, column))
      .toBe('ARC; NHMRC; ');
  });

  it('preserves legacy character iteration for string values', () => {
    spyOn(component, 'getEntryValue').and.callFake((_row, _col, value) => `[${value}]`);
    expect(component.getColValue({ metadata: { funders: 'AB' } }, column)).toBe('[A][B]');
  });
});
