import { of } from 'rxjs';
import { RB_HTTP_INTERCEPTOR_AUTH_CSRF } from '@researchdatabox/portal-ng-common';
import { PartyImportApiService } from './party-import-api.service';

describe('PartyImportApiService', () => {
  it('opts every write into the CSRF interceptor and unwraps the API envelope', async () => {
    const http: any = { post: jasmine.createSpy('post').and.returnValue(of({ data: { total: 1 } })) };
    const config: any = { getConfig: async () => ({ baseUrl: '', branding: 'default', portal: 'rdmp', csrfToken: 'session-token' }) };
    const util: any = { waitForDependencies: async () => {} };
    const service = new PartyImportApiService(http, '', util, config);
    expect(await service.request('inspect', { csv: 'Name,Email\nA,a@b.org' })).toEqual({ total: 1 });
    const [url, , options] = http.post.calls.mostRecent().args;
    expect(url).toBe('/default/rdmp/admin/parties/import/inspect');
    expect(options.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('session-token');
  });
});
