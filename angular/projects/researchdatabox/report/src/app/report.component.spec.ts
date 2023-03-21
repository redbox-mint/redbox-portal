import { TestBed } from '@angular/core/testing';
import { ReportComponent } from './report.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        ReportComponent
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(ReportComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title '@researchdatabox/report'`, () => {
    const fixture = TestBed.createComponent(ReportComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('@researchdatabox/report');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(ReportComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.content span')?.textContent).toContain('@researchdatabox/report app is running!');
  });
});
