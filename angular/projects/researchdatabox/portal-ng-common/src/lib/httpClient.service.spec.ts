import { HttpClient, HttpContextToken } from '@angular/common/http';
import { HttpClientService } from './httpClient.service';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { RB_HTTP_INTERCEPTOR_AUTH_CSRF } from './csrf.interceptor';

class CsrfEnabledService extends HttpClientService {
  enableCsrf(): void { this.enableCsrfHeader(); }
  context() { return this.httpContext; }
}

describe('HttpClientService configuration refresh', () => {
  it('retains request context and CSRF opt-in while reloading configuration', async () => {
    let config = { baseUrl: '', branding: 'default', portal: 'rdmp', csrfToken: 'original' };
    const configService = { waitForInit: async () => {}, getConfig: async () => config };
    const util = { waitForDependencies: async () => {} };
    const service = new CsrfEnabledService({} as HttpClient, '', util as unknown as UtilityService, configService as unknown as ConfigService);
    await service.waitForInit();
    service.enableCsrf();
    const context = service.context();
    const custom = new HttpContextToken(() => false);
    context.set(custom, true);

    config = { ...config, csrfToken: 'rotated', portal: 'refreshed' };
    await service.waitForInit();
    expect(service.getConfig().csrfToken).toBe('rotated');
    expect(service.brandingAndPortalUrl).toBe('/default/refreshed');
    expect(service.context()).toBe(context);
    expect(service.context().get(custom)).toBeTrue();
    expect(service.context().get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('original');
    // Existing opt-in values are markers: CsrfInterceptor uses ConfigService's current token.
  });
});
