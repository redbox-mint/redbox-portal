import { TestBed, ComponentFixture } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { Pipe, PipeTransform } from '@angular/core';
import { BrandingAdminComponent } from './branding-admin.component';
import { BrandingAdminService } from './branding-admin.service';
import { BrandingAdminState, BrandingTypefaceFace, BrandingTypefaceSlot } from './branding-admin.model';
import { LoggerService, TranslationService, ConfigService, UtilityService, I18NextPipe } from '@researchdatabox/portal-ng-common';
import { getStubConfigService } from '@researchdatabox/portal-ng-common';

@Pipe({ name: 'i18next', standalone: true })
class I18NextPipeStub implements PipeTransform {
  transform(key: string) { return key; }
}

class LoggerStub { debug() { /*noop*/ } error() { /*noop*/ } }
class TranslationStub {
  t(key: string) { return key; }
  isInitializing() { return false; }
  async waitForInit() { return this; }
}
class UtilityStub {
  async waitForDependencies(deps: any[]) {
    for (const d of deps) { if (d && typeof d.waitForInit === 'function') { await d.waitForInit(); } }
  }
}
const configStubInstance: any = getStubConfigService();
const testConfig = { baseUrl: 'http://test', branding: 'default', portal: 'rdmp', csrfToken: 'test-csrf' };
configStubInstance.getConfig = async () => testConfig;
configStubInstance.config = testConfig;

function face(slot: BrandingTypefaceSlot, sha: string, filename?: string): BrandingTypefaceFace {
  return { slot, sha256: sha, originalFilename: filename ?? `${slot}.woff2`, sizeBytes: 100, uploadedAt: '2026-01-01T00:00:00.000Z', inspection: {}, warnings: [] };
}

function adminState(overrides: Partial<BrandingAdminState> = {}): BrandingAdminState {
  return {
    branding: { id: 'brand-1', name: 'default' },
    active: { version: 1, hash: 'h', variables: { primary: '#112233' }, typeface: { mode: 'default', faces: {} } },
    draft: { revision: 2, variables: { primary: '#112233' }, typeface: { mode: 'default', faces: {} }, dirty: { colours: false, typeface: false } },
    versions: [
      { id: 'h1', version: 1, hash: 'h', dateCreated: '2026-01-01', actorId: 'u1', actorDisplayName: 'Admin', variables: {}, typeface: { mode: 'default', faces: {} } },
    ],
    limits: { faceMaxBytes: 1, familyMaxBytes: 2, historyMaxVersions: 3 },
    healthWarnings: [],
    ...overrides,
  };
}

describe('BrandingAdminComponent typography experience', () => {
  let fixture: ComponentFixture<BrandingAdminComponent>;
  let component: BrandingAdminComponent;
  let serviceStub: any;

  beforeEach(async () => {
    serviceStub = {
      getBrandingAndPortalUrl: () => 'http://test/default/rdmp',
      waitForInit: async () => serviceStub,
      loadConfig: () => Promise.resolve(adminState()),
      saveColourDraft: (variables: any, revision: number) => Promise.resolve(adminState()),
      uploadFace: (slot: string, file: any, name: string, revision: number) => Promise.resolve(adminState()),
      removeFace: (slot: string, revision: number) => Promise.resolve(adminState()),
      useDefaultTypography: (revision: number) => Promise.resolve(adminState()),
      revertTypefaceDraft: (revision: number) => Promise.resolve(adminState()),
      createPreview: (revision: number) => Promise.resolve({ token: 'tok', url: 'u', hash: 'h', revision, previewToken: 'tok', previewUrl: 'u' }),
      previewVersion: (id: string) => Promise.resolve({ token: 'tok', url: 'u', hash: 'h', previewToken: 'tok', previewUrl: 'u' }),
      publish: (version: number, revision: number) => Promise.resolve(adminState()),
      restore: (id: string, version: number, revision: number) => Promise.resolve(adminState()),
      uploadLogo: () => Promise.resolve({}),
      uploadFavicon: () => Promise.resolve({}),
    };
    await TestBed.configureTestingModule({
      imports: [BrandingAdminComponent, FormsModule, HttpClientTestingModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '' },
        { provide: LoggerService, useClass: LoggerStub },
        { provide: TranslationService, useClass: TranslationStub },
        { provide: ConfigService, useValue: configStubInstance },
        { provide: UtilityService, useClass: UtilityStub },
        { provide: BrandingAdminService, useValue: serviceStub },
      ],
    })
      .overrideComponent(BrandingAdminComponent, {
        remove: { providers: [BrandingAdminService], imports: [I18NextPipe] },
        add: { providers: [{ provide: BrandingAdminService, useValue: serviceStub }], imports: [I18NextPipeStub] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(BrandingAdminComponent);
    component = fixture.componentInstance;
  });

  async function initWith(state: BrandingAdminState) {
    serviceStub.loadConfig = () => Promise.resolve(state);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function settled() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads canonical state and filters colour keys', async () => {
    await initWith(adminState());
    expect(component.state?.draft.revision).toBe(2);
    expect(component.draftConfig).toEqual({ primary: '#112233' });
  });

  it('renders default, complete custom, incomplete, and warning states', async () => {
    await initWith(adminState());
    let text = fixture.nativeElement.textContent;
    expect(text).toContain('branding-typography-state-default');

    const complete = adminState({
      draft: { revision: 3, variables: {}, typeface: { mode: 'custom', faces: { regular: face('regular', 'a'.repeat(64)) } }, dirty: { colours: false, typeface: true } },
    });
    serviceStub.loadConfig = () => Promise.resolve(complete);
    await component.loadConfig();
    await settled();
    text = fixture.nativeElement.textContent;
    expect(text).toContain('branding-typography-state-custom');

    const incomplete = adminState({
      draft: { revision: 4, variables: {}, typeface: { mode: 'custom', faces: { bold: face('bold', 'b'.repeat(64)) } }, dirty: { colours: false, typeface: true } },
    });
    serviceStub.loadConfig = () => Promise.resolve(incomplete);
    await component.loadConfig();
    await settled();
    text = fixture.nativeElement.textContent;
    expect(text).toContain('branding-typography-incomplete');
    const publishButton = fixture.debugElement.query(By.css('button.btn-success'));
    expect(publishButton.nativeElement.disabled).toBe(true);

    const warned = adminState({
      draft: {
        revision: 5, variables: {},
        typeface: { mode: 'custom', faces: { regular: { ...face('regular', 'a'.repeat(64)), warnings: ['embedded subfamily differs'] } } },
        dirty: { colours: false, typeface: true },
      },
    });
    serviceStub.loadConfig = () => Promise.resolve(warned);
    await component.loadConfig();
    await settled();
    expect(fixture.nativeElement.textContent).toContain('embedded subfamily differs');
  });

  it('uploads, replaces, removes, defaults, and reverts with canonical counters', async () => {
    await initWith(adminState());
    const file = new File(['font'], 'regular.woff2', { type: 'font/woff2' });
    let resolveUpload!: (state: BrandingAdminState) => void;
    serviceStub.uploadFace = () => new Promise<BrandingAdminState>(resolve => { resolveUpload = resolve; });
    const pending = component.uploadFace('regular', { target: { files: [file], value: 'x' } } as unknown as Event);
    expect(component.isBusy('face-regular')).toBe(true);
    resolveUpload(adminState());
    await pending;
    expect(component.isBusy('face-regular')).toBe(false);

    await component.removeFace('regular');
    await component.useDefaultTypography();
    await component.revertTypefaceDraft();
    expect(component.state?.draft.revision).toBe(2);
  });

  it('escapes filenames through interpolation', async () => {
    const evil = adminState({
      draft: {
        revision: 2, variables: {},
        typeface: { mode: 'custom', faces: { regular: face('regular', 'a'.repeat(64), '<img src=x onerror=alert(1)>') } },
        dirty: { colours: false, typeface: true },
      },
    });
    await initWith(evil);
    const html = fixture.nativeElement.innerHTML;
    expect(html).not.toContain('<img src=x');
    expect(fixture.nativeElement.querySelectorAll('img').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows conflict reload without losing sample text', async () => {
    await initWith(adminState());
    component.sampleText = 'keep me';
    serviceStub.saveColourDraft = () => Promise.reject({ kind: 'conflict', status: 409, message: 'stale' });
    await component.saveDraft();
    expect(component.conflict).toBe(true);
    await settled();
    expect(fixture.nativeElement.textContent).toContain('branding-conflict-reload');
    serviceStub.loadConfig = () => Promise.resolve(adminState());
    await component.reloadState();
    expect(component.conflict).toBe(false);
    expect(component.sampleText).toBe('keep me');
  });

  it('renders preview roles and binds local sample text', async () => {
    await initWith(adminState());
    component.sampleText = 'Hello Masa';
    await component.createPreview();
    await settled();
    // Preview content renders inside the preview component's shadow DOM.
    const previewEl = fixture.nativeElement.querySelector('branding-preview') as HTMLElement;
    expect(previewEl).toBeTruthy();
    const shadow = previewEl.shadowRoot as ShadowRoot;
    expect(shadow.querySelector('.preview-sample-regular')?.textContent).toContain('Hello Masa');
    expect(shadow.querySelector('.preview-sample-bold')).toBeTruthy();
    expect(shadow.querySelector('.preview-sample-italic')).toBeTruthy();
    expect(shadow.querySelector('.preview-sample-bold-italic')).toBeTruthy();
    expect(shadow.querySelector('input.form-control')).toBeTruthy();
    expect(shadow.querySelector('button.btn-primary')).toBeTruthy();
    expect(shadow.querySelector('a[href="#"]')).toBeTruthy();
    // The admin-side sample input keeps the unsaved local text.
    const sampleInput = fixture.nativeElement.querySelector('#previewSampleText') as HTMLInputElement;
    expect(sampleInput.value).toBe('Hello Masa');
  });

  it('renders active health warnings without failing config load', async () => {
    const degraded = adminState({
      active: { version: 1, hash: 'h', variables: {}, typeface: { mode: 'custom', faces: { regular: face('regular', 'a'.repeat(64)) } } },
      healthWarnings: [{ code: 'face-unavailable', slot: 'regular', sha256: 'a'.repeat(64) }],
    });
    await initWith(degraded);
    expect(component.state?.healthWarnings?.length).toBe(1);
    await settled();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('branding-health-warnings-title');
    expect(text).toContain('face-unavailable');
  });

  it('lists history with actor and active marker, previews, and restores with confirmation', async () => {
    const state = adminState({
      versions: [
        { id: 'h2', version: 2, hash: 'h2', dateCreated: '2026-02-01', actorId: 'u2', actorDisplayName: 'Second Admin', variables: {}, typeface: { mode: 'custom', faces: {} } },
        { id: 'h1', version: 1, hash: 'h1', dateCreated: '2026-01-01', actorId: 'u1', actorDisplayName: 'Admin', variables: {}, typeface: { mode: 'default', faces: {} } },
      ],
    });
    await initWith(state);
    // Active marker follows the active version (set active to version 2).
    component.state = adminState({
      active: { version: 2, hash: 'h2', variables: {}, typeface: { mode: 'custom', faces: {} } },
      draft: { revision: 5, variables: {}, typeface: { mode: 'custom', faces: {} }, dirty: { colours: false, typeface: false } },
      versions: state.versions,
    });
    await settled();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Second Admin');
    expect(text).toContain('branding-history-active');
    expect(text.indexOf('v2')).toBeLessThan(text.indexOf('v1'));

    const version = component.versions[0];
    await component.previewVersionEntry(version);
    expect(component.previewCssUrl).toContain('/preview/tok.css');

    expect(component.pendingRestoreId).toBeNull();
    component.confirmRestore('h1');
    expect(component.pendingRestoreId).toBe('h1');
    await settled();
    expect(fixture.nativeElement.textContent).toContain('branding-restore-confirm');
    await component.restoreVersion({ ...version, id: 'h1', version: 1 });
    expect(component.pendingRestoreId).toBeNull();
  });

  it('keeps colour, logo, and favicon flows working', async () => {
    await initWith(adminState());
    component.draftConfig['primary'] = '#ffffff';
    await component.saveDraft();
    expect(component.message).toBe('branding-draft-saved');
    const file = new File(['img'], 'logo.png', { type: 'image/png' });
    await component.uploadLogo({ target: { files: [file] } } as unknown as Event);
    expect(component.message).toBe('branding-logo-uploaded');
    await component.uploadFavicon({ target: { files: [file] } } as unknown as Event);
    expect(component.message).toBe('branding-favicon-uploaded');
    await component.publish();
    expect(component.message).toBe('branding-published');
  });

  it('clears a displayed preview on every draft mutation', async () => {
    await initWith(adminState());
    await component.createPreview();
    expect(component.previewCssUrl).toContain('/preview/tok.css');
    const font = new File(['font'], 'regular.woff2', { type: 'font/woff2' });
    await component.uploadFace('regular', { target: { files: [font], value: 'x' } } as unknown as Event);
    expect(component.previewCssUrl).toBeUndefined();
    await component.createPreview();
    expect(component.previewCssUrl).toContain('/preview/tok.css');
    await component.removeFace('regular');
    expect(component.previewCssUrl).toBeUndefined();
    await component.createPreview();
    await component.useDefaultTypography();
    expect(component.previewCssUrl).toBeUndefined();
    await component.createPreview();
    await component.revertTypefaceDraft();
    expect(component.previewCssUrl).toBeUndefined();
  });
});
