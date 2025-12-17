import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HandlebarsTemplateService } from './handlebars-template.service';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import Handlebars from 'handlebars';

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
                { provide: ConfigService, useValue: configSpy }
            ]
        });

        service = TestBed.inject(HandlebarsTemplateService);
        utilityServiceSpy = TestBed.inject(UtilityService) as jasmine.SpyObj<UtilityService>;
        loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    describe('loadDashboardTemplates', () => {
        it('should load module via utility service and register it', async () => {
            const mockModule = {
                evaluate: jasmine.createSpy('evaluate')
            };
            utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve(mockModule));

            await service.loadDashboardTemplates('default', 'portal', 'rdmp', 'draft');

            expect(utilityServiceSpy.getDynamicImport).toHaveBeenCalled();
            // Verify registration logic by checking slightly implementation details or checking logging
            expect(loggerServiceSpy.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Loaded templates for/));
        });

        it('should handle load error', async () => {
            utilityServiceSpy.getDynamicImport.and.returnValue(Promise.reject('Network error'));

            await service.loadDashboardTemplates('default', 'portal', 'rdmp', 'draft');

            expect(loggerServiceSpy.error).toHaveBeenCalledWith(jasmine.stringMatching(/Failed to load dashboard templates/), 'Network error');
        });
    });

    describe('compileAndRunTemplate', () => {
        it('should execute precompiled template from loaded module if keys provided', async () => {
            // Create a real template spec using the full Handlebars (imported in test)
            const templateString = 'Precompiled: {{title}}';
            const precompiledString = Handlebars.precompile(templateString);
            // Convert string to spec object (simulating what the build/loader does)
            const templateSpec = new Function('return ' + precompiledString)();

            const mockModule = {
                evaluate: jasmine.createSpy('evaluate').and.callFake((keyParts, context, options) => {
                    // Use the Handlebars instance passed from the service (runtime)
                    const hbs = options.libraries.Handlebars;
                    const template = hbs.template(templateSpec);
                    return template(context);
                })
            };

            utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve(mockModule));

            // Load first
            await service.loadDashboardTemplates('default', 'portal', 'rdmp', 'draft');

            // Run
            const key = ['rdmp', 'draft', 'rowConfig', '0', 'title'];
            const context = { title: 'Test Record' };
            const fallback = 'Fallback {{title}}';

            const result = service.compileAndRunTemplate(fallback, context, key);

            expect(result).toBe('Precompiled: Test Record');
            expect(mockModule.evaluate).toHaveBeenCalled();
        });

        it('should return empty string and log warning if key not found (CSP)', async () => {
            const mockModule = {
                evaluate: jasmine.createSpy('evaluate').and.returnValue(null)
            };
            utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve(mockModule));

            await service.loadDashboardTemplates('default', 'portal', 'rdmp', 'draft');

            const key = ['rdmp', 'draft', 'unknown'];
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
