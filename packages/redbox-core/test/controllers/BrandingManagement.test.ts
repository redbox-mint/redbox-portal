
import sinon from 'sinon';



import { brandingFaceUploadRoute, brandingRestoreRoute, brandingVersionPreviewRoute } from '../../src/api-routes/groups/branding';
import { validateApiRouteRequest } from '../../src/api-routes/validation';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

describe('Owned branding management HTTP and contracts', function () {

it('preserves branding and portal through slot/version param validation', function () {
    const request = {
      params: { branding: 'default', portal: 'portal', slot: 'regular' },
      query: {},
      headers: {},
      body: {},
    };
    const upload = validateApiRouteRequest(request, brandingFaceUploadRoute, { files: { face: [{ size: 128 }] } });
    expect(upload.valid).to.equal(true);
    if (!upload.valid) throw new Error('Expected upload validation');
    expect(upload.params).to.include({ branding: 'default', portal: 'portal', slot: 'regular' });
    const versioned = {
      params: { branding: 'default', portal: 'portal', versionId: 'h1' },
      query: {},
      headers: { 'content-type': 'application/json' },
      body: { expectedVersion: 1, expectedDraftRevision: 2 },
    };
    for (const route of [brandingRestoreRoute, brandingVersionPreviewRoute]) {
      const result = validateApiRouteRequest(versioned, route);
      expect(result.valid).to.equal(true);
      if (!result.valid) throw new Error('Expected version validation');
      expect(result.params).to.include({ branding: 'default', portal: 'portal', versionId: 'h1' });
    }
  });
afterEach(() => sinon.restore());
});
