import { TestBed } from '@angular/core/testing';
import { LocalAuthComponent } from './local-auth.component';

describe('LocalAuthComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        LocalAuthComponent
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(LocalAuthComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // it(`should have as title '@researchdatabox/localAuth'`, () => {
  //   const fixture = TestBed.createComponent(LocalAuthComponent);
  //   const app = fixture.componentInstance;
  //   expect(app.title).toEqual('@researchdatabox/localAuth');
  // });

  // it('should render title', () => {
  //   const fixture = TestBed.createComponent(LocalAuthComponent);
  //   fixture.detectChanges();
  //   const compiled = fixture.nativeElement as HTMLElement;
  //   expect(compiled.querySelector('.content span')?.textContent).toContain('@researchdatabox/localAuth app is running!');
  // });
});
