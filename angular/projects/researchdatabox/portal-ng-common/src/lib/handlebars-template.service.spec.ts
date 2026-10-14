import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HandlebarsTemplateService } from './handlebars-template.service';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import { handlebarsPrecompile } from "@researchdatabox/sails-ng-common";

describe('HandlebarsTemplateService', () => {
  let service: HandlebarsTemplateService;
  let utilityServiceSpy: jasmine.SpyObj<UtilityService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    const utilSpy = jasmine.createSpyObj('UtilityService', ['getDynamicImport']);
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['debug', 'error', 'warn']);
    const configSpy = jasmine.createSpyObj('ConfigService', ['get']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        HandlebarsTemplateService,
        { provide: APP_BASE_HREF, useValue: '/' },
        { provide: UtilityService, useValue: utilSpy },
        { provide: LoggerService, useValue: loggerSpy },
        { provide: ConfigService, useValue: configSpy },
      ],
    });

    service = TestBed.inject(HandlebarsTemplateService);
    utilityServiceSpy = TestBed.inject(UtilityService) as jasmine.SpyObj<UtilityService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadDashboardTargetTemplates', () => {
    const workflow = { kind: 'workflow' as const, recordType: 'rdmp', stage: 'draft' };
    const view = { kind: 'view' as const, view: 'consolidated', step: 'main' };

    it('builds a key prefix that includes brand, target and settings version', () => {
      expect(service.buildDashboardTemplateKeyPrefix('default', workflow, 'abcdef0123456789ffff')).toEqual(['default', 'workflow', 'rdmp', 'draft', 'abcdef0123456789']);
      expect(service.buildDashboardTemplateKeyPrefix('default', view, '1234')).toEqual(['default', 'view', 'consolidated', 'main', '1234']);
    });

    it('requests templates pinned to the settings fingerprint and registers them once', async () => {
      utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve({ evaluate: jasmine.createSpy('evaluate') }));

      expect(await service.loadDashboardTargetTemplates('default', 'portal', workflow, 'fp1')).toBeTrue();
      expect(await service.loadDashboardTargetTemplates('default', 'portal', workflow, 'fp1')).toBeTrue();

      expect(utilityServiceSpy.getDynamicImport).toHaveBeenCalledOnceWith(
        jasmine.any(String),
        ['dynamicAsset', 'recordDashboardTemplates', 'rdmp', 'draft'],
        { settingsFingerprint: 'fp1' }
      );
      expect(service.hasTemplate('default__workflow__rdmp__draft__fp1')).toBeTrue();
    });

    it('uses the view template endpoint for view steps', async () => {
      utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve({ evaluate: jasmine.createSpy('evaluate') }));
      await service.loadDashboardTargetTemplates('default', 'portal', view, 'fp2');
      expect(utilityServiceSpy.getDynamicImport).toHaveBeenCalledWith(jasmine.any(String), ['dynamicAsset', 'dashboardViewTemplates', 'consolidated', 'main'], { settingsFingerprint: 'fp2' });
    });

    it('reports failure when settings changed (409) or the module is invalid', async () => {
      utilityServiceSpy.getDynamicImport.and.returnValue(Promise.reject('409'));
      expect(await service.loadDashboardTargetTemplates('default', 'portal', workflow, 'old')).toBeFalse();
      utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve({}));
      expect(await service.loadDashboardTargetTemplates('default', 'portal', workflow, 'other')).toBeFalse();
      expect(loggerServiceSpy.error).toHaveBeenCalledWith(jasmine.stringMatching(/Invalid dashboard template module/));
    });
  });

  describe('compileAndRunTemplate', () => {
    it('should execute precompiled template from loaded module if keys provided', async () => {
      // Create a real template spec using the full Handlebars (imported in test)
      const templateString = 'Precompiled: {{title}}';
      const precompiledString = handlebarsPrecompile(templateString);
      // Convert string to spec object (simulating what the build/loader does)
      const templateSpec = new Function('return ' + precompiledString)();

      const mockModule = {
        evaluate: jasmine.createSpy('evaluate').and.callFake((keyParts, context, options) => {
          // Use the Handlebars instance passed from the service (runtime)
          const hbs = options.libraries.handlebars;
          const template = hbs(templateSpec);
          return template(context);
        }),
      };

      utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve(mockModule));

      // Load first
      await service.loadDashboardTargetTemplates('default', 'portal', { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, 'fp');

      // Run
      const key = ['default', 'workflow', 'rdmp', 'draft', 'fp', 'rowConfig', '0', 'title'];
      const context = { title: 'Test Record' };
      const fallback = 'Fallback {{title}}';

      const result = service.compileAndRunTemplate(fallback, context, key);

      expect(result).toBe('Precompiled: Test Record');
      expect(mockModule.evaluate).toHaveBeenCalled();
    });

    it('should return empty string and log warning if key not found (CSP)', async () => {
      const mockModule = {
        evaluate: jasmine.createSpy('evaluate').and.returnValue(null),
      };
      utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve(mockModule));

      await service.loadDashboardTargetTemplates('default', 'portal', { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, 'fp');

      const key = ['default', 'workflow', 'rdmp', 'draft', 'fp', 'unknown'];
      const context = { title: 'Fallback' };
      const fallback = 'Message: {{title}}';

      const result = service.compileAndRunTemplate(fallback, context, key);

      expect(result).toBe('');
      expect(loggerServiceSpy.warn).toHaveBeenCalledWith(jasmine.stringMatching(/Pre-compiled template not found/));
    });

    it('should return empty string and log warning if no keys provided (CSP)', () => {
      const context = { title: 'Fallback' };
      const fallback = 'Message: {{title}}';

      const result = service.compileAndRunTemplate(fallback, context);

      expect(result).toBe('');
      expect(loggerServiceSpy.warn).toHaveBeenCalledWith(jasmine.stringMatching(/No key parts provided/));
    });
  });
});
