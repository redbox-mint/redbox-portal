import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardConfigEditorComponent } from './dashboard-config-editor.component';
import { DashboardConfigApiService } from './dashboard-config-api.service';
import { LoggerService, TranslationService, ConfigService, UtilityService } from '@researchdatabox/portal-ng-common';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';

class MockDashboardConfigApiService {}
class MockLoggerService {}
class MockTranslationService {
  t = (key: string) => key;
}
class MockConfigService {}
class MockUtilityService {}
class MockHttpClient {}

describe('DashboardConfigEditorComponent', () => {
  let component: DashboardConfigEditorComponent;
  let fixture: ComponentFixture<DashboardConfigEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DashboardConfigEditorComponent],
      providers: [
        { provide: DashboardConfigApiService, useClass: MockDashboardConfigApiService },
        { provide: LoggerService, useClass: MockLoggerService },
        { provide: TranslationService, useClass: MockTranslationService },
        { provide: ConfigService, useClass: MockConfigService },
        { provide: UtilityService, useClass: MockUtilityService },
        { provide: HttpClient, useClass: MockHttpClient },
        { provide: APP_BASE_HREF, useValue: '/' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardConfigEditorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
