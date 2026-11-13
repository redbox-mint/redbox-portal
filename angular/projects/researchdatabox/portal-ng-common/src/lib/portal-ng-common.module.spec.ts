import { ApplicationInitStatus, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BaseComponent } from './base.component';
import { ConfigService } from './config.service';
import { TranslationService } from './translation.service';
import { RedboxPortalCoreModule } from './portal-ng-common.module';

@Component({
  template: '{{ loadError }}',
  standalone: false
})
class BootstrapRecoveryComponent extends BaseComponent {
  constructor() {
    super();
    this.initDependencies = [inject(TranslationService)];
  }
  protected async initComponent(): Promise<void> {}
}

describe('Portal module bootstrap recovery', () => {
  it('creates the root after bootstrap HTTP failure so it can show and retry the error', async () => {
    TestBed.configureTestingModule({
      declarations: [BootstrapRecoveryComponent],
      imports: [RedboxPortalCoreModule, HttpClientTestingModule]
    });
    const initializers = TestBed.inject(ApplicationInitStatus);
    await initializers.donePromise;
    const fixture = TestBed.createComponent(BootstrapRecoveryComponent);
    const component = fixture.componentInstance;
    const config = TestBed.inject(ConfigService);
    const http = TestBed.inject(HttpTestingController);
    const waiting = expectAsync(component.waitForInit()).toBeRejected();
    fixture.detectChanges();
    http.expectOne(config.csrfTokenUrl).flush('denied', { status: 403, statusText: 'Forbidden' });
    await waiting;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sign in again');
    expect(component.loadPending).toBeFalse();

    const retry = component.retryLoad();
    http.expectOne(config.csrfTokenUrl).flush({ _csrf: 'refreshed' });
    http.expectOne(config.configUrl).flush({
      baseUrl: '', branding: 'default', portal: 'rdmp',
      i18NextOpts: {
        lng: 'en', fallbackLng: 'en',
        resources: { en: { translation: { ready: 'Ready' } } }
      }
    });
    await retry;
    await component.waitForInit();
    expect(component.loadError).toBe('');
    expect(component.loadPending).toBeFalse();
    http.verify();
    fixture.destroy();
  });
});
