import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BaseComponent } from './base.component';
import { delay, firstValueFrom, of } from 'rxjs';
import { getStubConfigService } from './helper.spec';

class TestComponent extends BaseComponent {
  constructor() {
    super();
    const configService:any = getStubConfigService();
    this.initDependencies = [configService];
  }
  
  protected async initComponent(): Promise<any> {
    return firstValueFrom(
      of(true).pipe(
        delay(300)
      )
    )
  }
}
describe('BaseComponent', () => {
  let component: TestComponent;
  let fixture: ComponentFixture<TestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TestComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TestComponent);
    component = fixture.componentInstance;
  });

  it('should create and init correctly ', async () => {
    expect(component).toBeTruthy();
    expect(component.isInitializing()).toBeTrue();
    fixture.detectChanges();
    // test the wait
    await component.waitForInit();
    expect(component.isInitializing()).toBeFalse();
    // test if we still need to wait
    await component.waitForInit();
    expect(component.isInitializing()).toBeFalse();
  });
});
