import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ConfigService, TranslationService, RB_HTTP_INTERCEPTOR_AUTH_CSRF } from '@researchdatabox/portal-ng-common';
import { dataGridsConfig } from './data-grids.config';
import { RecordGridService } from './record-grid.service';
import { NamedQueryApiService } from '../../../named-query-editor/src/app/named-query-api.service';

describe('Explorer application providers', () => {
  it('retains its configured services and current CSRF interceptor without loading unrelated admin modules', () => {
    TestBed.configureTestingModule({ providers: [...dataGridsConfig.providers, provideHttpClientTesting()] });
    TestBed.overrideProvider(ConfigService, { useValue: { csrfToken: 'rotated-token' } });
    expect(TestBed.inject(TranslationService)).toBeTruthy();
    expect(TestBed.inject(RecordGridService)).toBeTruthy();
    expect(TestBed.inject(NamedQueryApiService)).toBeTruthy();
    TestBed.inject(HttpClient)
      .post('/scoped-write', {}, { context: new HttpContext().set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, 'previous-token') })
      .subscribe();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('/scoped-write');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('rotated-token');
    expect(request.request.headers.get('X-Source')).toBe('jsclient');
    request.flush({});
    http.verify();
  });
});
