import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BrandingAdminComponent } from './branding-admin.component';

// Minimal stubs for portal-ng-common services
class LoggerStub { debug(){} error(){} }
class ConfigStub { static _getAppConfigProperty(_: any, __: string, ___: string, v: any){ return v; } getConfig(){ return Promise.resolve({}); } }
class TranslationStub { init(){ return Promise.resolve(); } }

describe('BrandingAdminComponent', () => {
  let component: BrandingAdminComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandingAdminComponent, HttpClientTestingModule],
      providers: [
        { provide: (window as any).LoggerService || 'LoggerService', useClass: LoggerStub },
      ]
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BrandingAdminComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
