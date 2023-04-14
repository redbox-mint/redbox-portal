import { TestBed } from '@angular/core/testing';
import { ManageRolesComponent } from './manage-roles.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        ManageRolesComponent
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(ManageRolesComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // it(`should have as title '@researchdatabox/manage-roles'`, () => {
  //   const fixture = TestBed.createComponent(ManageRolesComponent);
  //   const app = fixture.componentInstance;
  //   expect(app.title).toEqual('@researchdatabox/manage-roles');
  // });

  // it('should render title', () => {
  //   const fixture = TestBed.createComponent(ManageRolesComponent);
  //   fixture.detectChanges();
  //   const compiled = fixture.nativeElement as HTMLElement;
  //   expect(compiled.querySelector('.content span')?.textContent).toContain('@researchdatabox/manage-roles app is running!');
  // });
});
