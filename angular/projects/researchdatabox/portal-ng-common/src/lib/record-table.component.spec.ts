import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RecordTableComponent } from './record-table.component';
import { HandlebarsTemplateService } from './handlebars-template.service';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import { TranslationService } from './translation.service';
import { getStubTranslationService } from './helper.spec';
import { I18NextPipe } from './i18next.pipe';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgModel, FormsModule } from '@angular/forms';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { RecordPageDto, RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
import { RecordSource } from './record.model';
import { HeaderSortComponent } from './header-sort.component';
import { ConfigService } from './config.service';

describe('RecordTableComponent template readiness', () => {
  let templates: jasmine.SpyObj<HandlebarsTemplateService>;

  beforeEach(async () => {
    templates = jasmine.createSpyObj('HandlebarsTemplateService', ['prepareTemplates', 'compileAndRunTemplate']);
    templates.prepareTemplates.and.resolveTo();
    templates.compileAndRunTemplate.and.returnValue('<strong>rendered</strong>');
    await TestBed.configureTestingModule({
      declarations: [RecordTableComponent],
      imports: [I18NextPipe],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: HandlebarsTemplateService, useValue: templates },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: UtilityService, useValue: {} },
        { provide: TranslationService, useValue: getStubTranslationService() },
      ],
    }).compileComponents();
  });

  function create() {
    const fixture = TestBed.createComponent(RecordTableComponent);
    fixture.componentInstance.columnConfig = [{ property: 'content', label: 'Content', hide: false, multivalue: false,
      template: '{{{markdownToHtml content "markdown"}}}' }];
    fixture.componentInstance.reportName = 'report';
    fixture.componentInstance.dataSource = { getCurrentPage: () => ({ records: [{ content: '**raw**' }], total: 0 }) } as any;
    fixture.autoDetectChanges();
    return fixture;
  }

  it('keeps report cells hidden until Markdown preparation completes', async () => {
    let ready!: () => void;
    templates.prepareTemplates.and.returnValue(new Promise<void>(resolve => ready = resolve));
    const fixture = create();
    for (let i = 0; i < 10 && !templates.prepareTemplates.calls.count(); i++) await Promise.resolve();
    expect(templates.prepareTemplates).toHaveBeenCalled();
    expect(templates.compileAndRunTemplate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('td')).toBeNull();
    ready();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('td strong')?.textContent).toBe('rendered');
  });

  it('shows an error on parser failure without executing the template', async () => {
    templates.prepareTemplates.and.rejectWith(new Error('chunk unavailable'));
    const fixture = create();
    await fixture.whenStable();
    expect(fixture.componentInstance.templatesUnavailable).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(templates.compileAndRunTemplate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('**raw**');
  });
});

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
      imports: [FormsModule, PaginationModule, I18NextPipe],
      providers: [
        { provide: LoggerService, useValue: { error: jasmine.createSpy('error') } },
        { provide: UtilityService, useValue: {} },
        { provide: ConfigService, useValue: { refreshConfig: refresh } },
        { provide: TranslationService, useValue: getStubTranslationService() },
        { provide: HandlebarsTemplateService, useValue: { prepareTemplates: () => Promise.resolve(), compileAndRunTemplate: renderTemplate } }
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
    fixture.componentRef.setInput('paginationDisabled', true);
    await settle();
    pageLink(3).click();
    await component.gotoPage(3, fixture.debugElement.query(By.directive(NgModel)).injector.get(NgModel));
    await settle();
    expect(goto).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('paginationDisabled', false);
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
    headers[0].click();
    await settle();
    expect(headers[0].getAttribute('aria-sort')).toBe('ascending');
    headers[1].click();
    await settle();
    expect(headers[0].getAttribute('aria-sort')).toBeNull();
    expect(headers[1].getAttribute('aria-sort')).toBe('ascending');
    expect(source.headerSortChanged).toHaveBeenCalledWith(jasmine.objectContaining({ variable: 'tags', sort: 'asc' }), component.columnConfig[1]);
  });
});
