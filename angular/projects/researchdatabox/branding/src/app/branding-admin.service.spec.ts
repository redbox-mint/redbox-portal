import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BrandingAdminService } from './branding-admin.service';
import { BrandingAdminState } from './branding-admin.model';
import { ConfigService, UtilityService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService } from '@researchdatabox/portal-ng-common';

const testConfig = { baseUrl: 'http://test', branding: 'default', portal: 'rdmp', csrfToken: 'test-csrf' };
const configStubInstance: any = getStubConfigService();
configStubInstance.getConfig = async () => testConfig;
configStubInstance.config = testConfig;

class UtilityStub {
  async waitForDependencies(deps: any[]) {
    for (const d of deps) {
      if (d && typeof d.waitForInit === 'function') {
        await d.waitForInit();
      }
    }
  }
}

function adminState(): BrandingAdminState {
  return {
    branding: { id: 'brand-1', name: 'default' },
    active: { version: 1, hash: 'h', variables: {}, typeface: { mode: 'default', faces: {} } },
    draft: {
      revision: 2,
      variables: {},
      typeface: { mode: 'default', faces: {} },
      dirty: { colours: false, typeface: false },
    },
    versions: [],
    limits: { faceMaxBytes: 1, familyMaxBytes: 2, historyMaxVersions: 3 },
    healthWarnings: [],
  };
}

describe('BrandingAdminService', () => {
  let service: BrandingAdminService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '' },
        { provide: ConfigService, useValue: configStubInstance },
        { provide: UtilityService, useClass: UtilityStub },
        BrandingAdminService,
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(BrandingAdminService);
    await service.waitForInit();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads canonical config state', async () => {
    const promise = service.loadConfig();
    const req = httpMock.expectOne('http://test/default/rdmp/app/branding/config');
    expect(req.request.method).toBe('GET');
    req.flush(adminState());
    const state = await promise;
    expect(state.draft.revision).toBe(2);
  });

  it('sends counters from canonical state on colour save', async () => {
    const promise = service.saveColourDraft({ primary: '#ffffff' }, 2);
    const req = httpMock.expectOne('http://test/default/rdmp/app/branding/draft');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ variables: { primary: '#ffffff' }, expectedDraftRevision: 2 });
    req.flush(adminState());
    const state = await promise;
    expect(state.branding.name).toBe('default');
  });

  it('uploads faces as multipart with the revision field', async () => {
    const promise = service.uploadFace('regular', new Blob(['font']), 'regular.woff2', 2);
    const req = httpMock.expectOne('http://test/default/rdmp/app/branding/draft/typeface/faces/regular');
    expect(req.request.method).toBe('PUT');
    const body = req.request.body as FormData;
    expect(body.get('expectedDraftRevision')).toBe('2');
    expect((body.get('face') as File).name).toBe('regular.woff2');
    req.flush(adminState());
    await promise;
  });

  it('removes faces, defaults, reverts, previews, versions, publishes, and restores with counters', async () => {
    const remove = service.removeFace('bold', 2);
    const removeReq = httpMock.expectOne('http://test/default/rdmp/app/branding/draft/typeface/faces/bold');
    expect(removeReq.request.method).toBe('DELETE');
    expect(removeReq.request.body).toEqual({ expectedDraftRevision: 2 });
    removeReq.flush(adminState());
    await remove;

    const useDefault = service.useDefaultTypography(2);
    const defaultReq = httpMock.expectOne('http://test/default/rdmp/app/branding/draft/typeface/use-default');
    expect(defaultReq.request.body).toEqual({ expectedDraftRevision: 2 });
    defaultReq.flush(adminState());
    await useDefault;

    const revert = service.revertTypefaceDraft(2);
    httpMock.expectOne('http://test/default/rdmp/app/branding/draft/typeface/revert').flush(adminState());
    await revert;

    const preview = service.createPreview(2);
    const previewReq = httpMock.expectOne('http://test/default/rdmp/app/branding/preview');
    expect(previewReq.request.body).toEqual({ expectedDraftRevision: 2 });
    previewReq.flush({ token: 't', url: 'u', hash: 'h', revision: 2, previewToken: 't', previewUrl: 'u' });
    expect((await preview).revision).toBe(2);

    const versions = service.listVersions();
    const versionsReq = httpMock.expectOne('http://test/default/rdmp/app/branding/versions');
    expect(versionsReq.request.method).toBe('GET');
    versionsReq.flush([]);
    expect(await versions).toEqual([]);

    const versionPreview = service.previewVersion('h1');
    httpMock
      .expectOne('http://test/default/rdmp/app/branding/versions/h1/preview')
      .flush({ token: 't', url: 'u', hash: 'h' });
    await versionPreview;

    const publish = service.publish(1, 2);
    const publishReq = httpMock.expectOne('http://test/default/rdmp/app/branding/publish');
    expect(publishReq.request.body).toEqual({ expectedVersion: 1, expectedDraftRevision: 2 });
    publishReq.flush(adminState());
    await publish;

    const restore = service.restore('h1', 1, 2);
    const restoreReq = httpMock.expectOne('http://test/default/rdmp/app/branding/restore/h1');
    expect(restoreReq.request.body).toEqual({ expectedVersion: 1, expectedDraftRevision: 2 });
    restoreReq.flush(adminState());
    await restore;
  });

  it('normalises 409 conflicts and 413 limits for UI use', async () => {
    const conflict = service.saveColourDraft({}, 1);
    httpMock
      .expectOne('http://test/default/rdmp/app/branding/draft')
      .flush({ message: 'branding-conflict' }, { status: 409, statusText: 'Conflict' });
    try {
      await conflict;
      fail('expected conflict');
    } catch (error: any) {
      expect(error.kind).toBe('conflict');
      expect(error.status).toBe(409);
    }
    const limit = service.uploadFace('regular', new Blob(['x']), 'r.woff2', 1);
    httpMock
      .expectOne('http://test/default/rdmp/app/branding/draft/typeface/faces/regular')
      .flush({ message: 'too large' }, { status: 413, statusText: 'Payload Too Large' });
    try {
      await limit;
      fail('expected limit');
    } catch (error: any) {
      expect(error.kind).toBe('limit');
      expect(error.status).toBe(413);
    }
  });

  it('never calls the deprecated rollback route', async () => {
    const restore = service.restore('h1', 1, 2);
    httpMock.expectOne('http://test/default/rdmp/app/branding/restore/h1').flush(adminState());
    const state = await restore;
    expect(state.branding.name).toBe('default');
    httpMock.expectNone('http://test/default/rdmp/app/branding/rollback/h1');
  });
});
