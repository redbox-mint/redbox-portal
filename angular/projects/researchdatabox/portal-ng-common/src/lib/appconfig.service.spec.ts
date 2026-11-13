import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AppConfigService } from './appconfig.service';
import { RB_HTTP_INTERCEPTOR_AUTH_CSRF } from './csrf.interceptor';

describe('AppConfigService integration connection test', () => {
  it('posts the unsaved draft to the brand route with CSRF context and leaves it unchanged', async () => {
    const result = { ok: true, status: 'ok', latencyMs: 230, message: 'Connection OK' };
    const post = jasmine.createSpy('post').and.returnValue(of(result));
    const service = new AppConfigService(
      { post } as unknown as HttpClient, '', { waitForDependencies: async () => {} } as any,
      { waitForInit: async () => {}, getConfig: async () => ({ baseUrl: '', branding: 'test-brand', portal: 'rdmp', csrfToken: 'session-csrf' }) } as any,
      {} as any
    );
    await service.waitForInit();
    const draft = { connection: { baseUrl: 'https://draft.example', token: '' } };
    expect(await service.testConnection('figsharePublishing', draft)).toEqual(result as any);
    const [url, payload, options] = post.calls.mostRecent().args;
    expect(url).toBe('/test-brand/rdmp/admin/appconfig/figsharePublishing/test-connection');
    expect(payload).toEqual({ draft });
    expect(options.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('session-csrf');
    expect(draft.connection.token).toBe('');
  });
});
