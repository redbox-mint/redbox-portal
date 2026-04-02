import { Component, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BaseComponent } from './base.component';
import { delay, firstValueFrom, of } from 'rxjs';
import { getStubConfigService } from './helper.spec';

@Component({
  selector: 'lib-test-component',
  template: '{{ value }}',
  standalone: false
})
class TestComponent extends BaseComponent {
  value = 'pending';
  renderRequests = 0;

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

  async updateValueOutsideAngular(value: string): Promise<void> {
    await Promise.resolve();
    this.value = value;
  }

  protected override requestRender(): void {
    this.renderRequests += 1;
    super.requestRender();
  }
}
describe('BaseComponent', () => {
  let component: TestComponent;
  let fixture: ComponentFixture<TestComponent>;
  let ngZone: NgZone;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TestComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TestComponent);
    component = fixture.componentInstance;
    ngZone = TestBed.inject(NgZone);
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

  it('should request a render for async method updates triggered outside Angular', async () => {
    fixture.detectChanges();
    await component.waitForInit();
    expect(component.renderRequests).toBeGreaterThan(0);
    const initialRenderRequests = component.renderRequests;

    await ngZone.runOutsideAngular(async () => {
      await component.updateValueOutsideAngular('updated');
    });

    await fixture.whenStable();
    expect(component.value).toBe('updated');
    expect(component.renderRequests).toBeGreaterThan(initialRenderRequests);
  });
});
