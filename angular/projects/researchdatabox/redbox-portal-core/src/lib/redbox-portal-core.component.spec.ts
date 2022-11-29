import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RedboxPortalCoreComponent } from './redbox-portal-core.component';

describe('RedboxPortalCoreComponent', () => {
  let component: RedboxPortalCoreComponent;
  let fixture: ComponentFixture<RedboxPortalCoreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RedboxPortalCoreComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RedboxPortalCoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
