import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { BrandingAdminComponent } from './branding-admin.component';
import { BrandingAdminService } from './branding-admin.service';
// portal-ng-common public tokens (importing types only for reference if available at runtime)
import { LoggerService, TranslationService, ConfigService, UtilityService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService } from '@researchdatabox/portal-ng-common';

// Stubs mirroring those used in other specs (e.g., deleted-records)
class LoggerStub { debug(){/*noop*/} error(){/*noop*/} }
// Use existing helper stub factories for consistency
const configStubInstance: any = getStubConfigService();
const translationStubInstance: any = getStubTranslationService({});
// Ensure config stub returns required fields for HttpClientService
const testConfig = { baseUrl: 'http://test', branding: 'default', portal: 'rdmp', csrfToken: 'test-csrf' };
configStubInstance.getConfig = async () => testConfig;
configStubInstance.config = testConfig;
class UtilityStub {
  wait(ms: number){ return Promise.resolve(); }
  async waitForDependencies(deps: any[]){
    for (const d of deps) { if (d && typeof d.waitForInit === 'function') { await d.waitForInit(); } }
  }
}

describe('BrandingAdminComponent', () => {
  let fixture: any;
  let component: BrandingAdminComponent;
  let httpMock: HttpTestingController;
  let brandingService: BrandingAdminService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandingAdminComponent, HttpClientTestingModule, FormsModule],
      providers: [
  { provide: APP_BASE_HREF, useValue: '' },
  { provide: LoggerService, useClass: LoggerStub },
  { provide: TranslationService, useValue: translationStubInstance },
  { provide: ConfigService, useValue: configStubInstance },
        { provide: UtilityService, useClass: UtilityStub },
        BrandingAdminService
      ]
    }).compileComponents();

  httpMock = TestBed.inject(HttpTestingController);
  brandingService = TestBed.inject(BrandingAdminService);
  fixture = TestBed.createComponent(BrandingAdminComponent);
  component = fixture.componentInstance;
  // Explicitly wait for the service init (avoids race with BaseComponent async init)
  await brandingService.waitForInit();
  // NOTE: We intentionally do NOT call fixture.detectChanges() here so the component's
  // BaseComponent-driven init (which would auto-call loadConfig) is skipped. Each test
  // takes explicit control of when loadConfig is invoked, preventing stray unflushed
  // HTTP GET /app/branding/config requests that were causing verify() failures.
  });

  // We'll manually verify inside each test after flushing expected requests to avoid timing races.


  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads config and sets publishedConfig', async () => {
    const loadPromise = component.loadConfig();
    const cfgReq = httpMock.expectOne(r => r.url.endsWith('/app/branding/config'));
    cfgReq.flush({ branding: { variables: { primary: '#123456' }, version: 1 } });
    await loadPromise;
  expect(component.publishedConfig?.variables?.['primary']).toBe('#123456');
    httpMock.verify();
  });

  it('filters legacy variables from draftConfig on load', async () => {
    const loadPromise = component.loadConfig();
    const cfgReq = httpMock.expectOne(r => r.url.endsWith('/app/branding/config'));
    cfgReq.flush({
      branding: {
        variables: {
          primary: '#123456',
          'branding-font-family': 'Arial, sans-serif',
        },
        version: 1
      }
    });
    await loadPromise;

    expect(component.draftConfig['primary']).toBe('#123456');
    expect(component.draftConfig['branding-font-family']).toBeUndefined();
    httpMock.verify();
  });

  it('saveDraft sets message on success', async () => {
    const loadPromise = component.loadConfig();
    httpMock.expectOne(r => r.url.endsWith('/app/branding/config')).flush({ branding: { variables: {}, version: 1 } });
    await loadPromise;
    component.draftConfig['primary'] = '#abcdef';
    const savePromise = component.saveDraft();
    const saveReq = httpMock.expectOne(r => r.url.endsWith('/app/branding/draft'));
    // Assert the POST body format is { variables: {...} }
    expect(saveReq.request.method).toBe('POST');
    expect(saveReq.request.body).toEqual({ variables: component.draftConfig });
    saveReq.flush({ branding: { variables: { primary: '#abcdef' }, version: 1 } });
    await savePromise;
    expect(component.message).toBe('Draft saved');
  expect(component.publishedConfig?.variables?.['primary']).toBe('#abcdef');
    httpMock.verify();
  });

  it('saveDraft shows error message on invalid variables', async () => {
    const loadPromise = component.loadConfig();
    httpMock.expectOne(r => r.url.endsWith('/app/branding/config')).flush({ branding: { variables: {}, version: 1 } });
    await loadPromise;
    component.draftConfig['branding-font-family'] = 'Arial, sans-serif';
    const savePromise = component.saveDraft();
    const saveReq = httpMock.expectOne(r => r.url.endsWith('/app/branding/draft'));
    saveReq.flush({ error: 'invalid-variable', message: 'Invalid variable key: branding-font-family' }, { status: 400, statusText: 'Bad Request' });
    await savePromise.catch(() => {});
    expect(component.error).toContain('Invalid variable key: branding-font-family');
    httpMock.verify();
  });

  it('createPreview stores previewToken', async () => {
    component.draftConfig['primary'] = '#123456';
    const componentBrandingService = (component as any).brandingService as BrandingAdminService;
    const saveSpy = spyOn(componentBrandingService, 'saveDraft').and.resolveTo({ branding: { variables: { primary: '#123456' }, version: 1 } });
    const previewSpy = spyOn(componentBrandingService, 'createPreview').and.resolveTo({ token: 'preview-token-123', url: '/branding/rdmp/preview/preview-token-123.css' });
    await component.createPreview();
    expect(saveSpy).toHaveBeenCalledWith(component.draftConfig);
    expect(previewSpy).toHaveBeenCalled();
    expect(component.previewToken).toBe('preview-token-123');
    expect(component.publishedConfig?.variables?.['primary']).toBe('#123456');
    // Base/preview CSS URLs set after preview
    expect(component.previewBaseCssUrl).toContain('/styles/style.min.css');
    expect(component.previewCssUrl).toContain('/preview/preview-token-123.css');
    httpMock.verify();
  });

  it('exposes new variable keys in groups (e.g., Bootstrap contextual, menu, footer)', () => {
    // Create component to access colourGroups definition
    expect(component).toBeTruthy();
    // Initialize colourGroups since detectChanges() is skipped in test setup
    (component as any).initializeColourGroups();
    const allKeys = (component as any).colourGroups.flatMap((g: any) => g.variables.map((v: any) => v.key));
    // Spot-check a few critical keys we added
    expect(allKeys).toContain('primary');
    expect(allKeys).toContain('secondary');
    expect(allKeys).toContain('light');
    expect(allKeys).toContain('dark');
    expect(allKeys).toContain('main-menu-active-dropdown-item-background-color');
    expect(allKeys).toContain('footer-bottom-area-branding-background-color');
  });

  it('publish saves draft before publishing and reloads config', async () => {
  component.publishedConfig = { variables: {}, version: '1' };
  component.draftConfig['primary'] = '#fff000';
  const componentBrandingService = (component as any).brandingService as BrandingAdminService;
  const saveSpy = spyOn(componentBrandingService, 'saveDraft').and.resolveTo({ branding: { variables: { primary: '#fff000' }, version: 1 } });
  const publishSpy = spyOn(componentBrandingService, 'publish').and.resolveTo({ version: 2, hash: 'abcd' });
  const loadSpy = spyOn(component, 'loadConfig').and.resolveTo();
  await component.publish();
  expect(saveSpy).toHaveBeenCalledWith(component.draftConfig);
  expect(publishSpy).toHaveBeenCalledWith(1);
  expect(loadSpy).toHaveBeenCalled();
  });
});
