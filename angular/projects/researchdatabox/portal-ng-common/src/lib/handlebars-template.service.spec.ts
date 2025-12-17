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

            expect(loggerServiceSpy.error).toHaveBeenCalledWith(jasmine.stringMatching(/Error loading dashboard templates/), 'Network error');
        });
    });

    describe('compileAndRunTemplate', () => {
        it('should execute precompiled template from loaded module if keys provided', async () => {
            // Mock module that returns a template spec
            const templateSpec = Handlebars.precompile('Precompiled: {{title}}');
            // evaluate must return the SPEC (object/string whatever Handlebars.template takes)
            // Handlebars.template takes the precompiled spec (compiled by Handlebars.precompile and eval'd)
            // Wait, Handlebars.precompile returns a STRING of JS code.
            // My service expects module.evaluate to return the spec OBJECT or Function?
            // "const template = Handlebars.template(templateSpec);"
            // Handlebars.template takes a TemplateSpecification.
            // In browser, Handlebars.precompile usually returns a string function source.
            // If I mock evaluate to return a compiled template function directly?
            // My service code: "const template = Handlebars.template(templateSpec);"
            // So templateSpec must be the spec object.

            // To test this easily without dealing with Handlebars internals, 
            // I'll mock Handlebars.template in the test?
            // Or just trust that if evaluate returns something truthy, it tries.

            // Let's mock the module.evaluate to return a dummy spec.
            const mockSpec = { main: () => "Evaluated Result" }; // Fake spec
            const mockModule = {
                evaluate: jasmine.createSpy('evaluate').and.returnValue(mockSpec)
            };

            // We need to spy on Handlebars.template to return a dummy function
            spyOn(Handlebars, 'template').and.returnValue(() => 'Evaluated Result');

            utilityServiceSpy.getDynamicImport.and.returnValue(Promise.resolve(mockModule));

            // Load first
            await service.loadDashboardTemplates('default', 'portal', 'rdmp', 'draft');

            // Run
            const key = ['rdmp', 'draft', 'rowConfig', '0', 'title'];
            const context = { title: 'Test Record' };
            const fallback = 'Fallback {{title}}';

            const result = service.compileAndRunTemplate(fallback, context, key);

            expect(result).toBe('Evaluated Result');
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
