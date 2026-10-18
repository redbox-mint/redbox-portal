import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RecordTableComponent } from './record-table.component';
import { HandlebarsTemplateService } from './handlebars-template.service';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import { TranslationService } from './translation.service';
import { getStubTranslationService } from './helper.spec';
import { I18NextPipe } from './i18next.pipe';

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
