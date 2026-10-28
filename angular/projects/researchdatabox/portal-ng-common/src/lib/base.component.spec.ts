import { Component, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
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
      declarations: [ TestComponent ],
      providers: [{ provide: ConfigService, useValue: { refreshConfig: () => Promise.resolve({}) } }]
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

  it('propagates bootstrap rejection to waiters and recovers on retry', async () => {
    const failure = { status: 403 };
    const waiting = expectAsync(component.waitForInit()).toBeRejectedWith(failure);
    fixture.detectChanges();
    const init = spyOn<any>(component, 'initComponent').and.rejectWith(failure);
    await waiting;
    await expectAsync(component.waitForInit()).toBeRejectedWith(failure);
    expect(component.loadPending).toBeFalse();
    expect(component.loadError).toContain('Sign in again');
    init.and.resolveTo();
    await component.retryLoad();
    await component.waitForInit();
    expect(component.loadPending).toBeFalse();
    expect(component.loadError).toBe('');
  });

  it('propagates a failed config refresh and permits another retry', async () => {
    const waiting = expectAsync(component.waitForInit()).toBeRejected();
    fixture.detectChanges();
    const init = spyOn<any>(component, 'initComponent').and.rejectWith({ status: 500 });
    await waiting;
    const refresh = spyOn(TestBed.inject(ConfigService), 'refreshConfig').and.rejectWith({ status: 0 });
    await component.retryLoad();
    await expectAsync(component.waitForInit()).toBeRejected();
    expect(component.loadPending).toBeFalse();
    expect(component.loadError).toContain('Check your connection');
    refresh.and.resolveTo({});
    init.and.resolveTo();
    await component.retryLoad();
    await component.waitForInit();
    expect(component.loadError).toBe('');
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
