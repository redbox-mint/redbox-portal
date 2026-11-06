import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { getStubTranslationService } from './helper.spec';
import { AdminSaveShortcutComponent } from './admin-save-shortcut.component';

describe('AdminSaveShortcutComponent', () => {
  let notify: IntersectionObserverCallback;
  let observer: jasmine.SpyObj<IntersectionObserver>;
  beforeEach(() => {
    observer = jasmine.createSpyObj('IntersectionObserver', ['observe', 'disconnect']);
    spyOn(window, 'IntersectionObserver').and.callFake(function(callback) { notify = callback; return observer; });
    TestBed.configureTestingModule({ imports: [AdminSaveShortcutComponent], providers: [
      { provide: TranslationService, useValue: getStubTranslationService() }
    ] });
  });

  it('shows only for dirty offscreen bars, emits save and respects disabled state', () => {
    const fixture = TestBed.createComponent(AdminSaveShortcutComponent);
    const bar = document.createElement('div');
    fixture.componentRef.setInput('bar', new ElementRef(bar));
    fixture.detectChanges();
    notify([{ isIntersecting: false } as IntersectionObserverEntry], observer);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    fixture.componentRef.setInput('dirty', true); fixture.detectChanges();
    const save = spyOn(fixture.componentInstance.save, 'emit');
    fixture.nativeElement.querySelector('button').click();
    expect(save).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(save).toHaveBeenCalledTimes(1);
    notify([{ isIntersecting: true } as IntersectionObserverEntry], observer); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    fixture.destroy();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('reconnects when changing editor targets and hides when the bar is removed', () => {
    const fixture = TestBed.createComponent(AdminSaveShortcutComponent);
    const first = new ElementRef(document.createElement('div'));
    const second = new ElementRef(document.createElement('div'));
    fixture.componentRef.setInput('bar', first); fixture.detectChanges();
    fixture.componentRef.setInput('bar', second); fixture.detectChanges();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(observer.observe).toHaveBeenCalledWith(second.nativeElement);
    fixture.componentRef.setInput('bar', undefined); fixture.detectChanges();
    expect(fixture.componentInstance.offscreen).toBeFalse();
  });
});
