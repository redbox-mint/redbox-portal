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

  it('scrolls an obscured focused field above the pill, leaving clear fields in place', () => {
    const fixture = TestBed.createComponent(AdminSaveShortcutComponent);
    fixture.componentRef.setInput('dirty', true); fixture.detectChanges();
    fixture.componentInstance.offscreen = true; fixture.detectChanges();
    const input = document.createElement('input'); document.body.append(input); input.focus();
    const pill = fixture.nativeElement.querySelector('.rb-admin-save-shortcut');
    spyOn(pill, 'getBoundingClientRect').and.returnValue({ left: 700, right: 950, top: 700, bottom: 760 });
    spyOn(input, 'getBoundingClientRect').and.returnValue({ left: 300, right: 900, top: 680, bottom: 730 } as DOMRect);
    const scroll = spyOn(window, 'scrollBy');
    fixture.componentInstance.keepFocusedFieldVisible();
    expect(scroll.calls.mostRecent().args[0]).toEqual({ top: 42, behavior: 'instant' } as any);
    scroll.calls.reset();
    (input.getBoundingClientRect as jasmine.Spy).and.returnValue({ left: 300, right: 600, top: 680, bottom: 730 });
    fixture.componentInstance.keepFocusedFieldVisible();
    expect(scroll).not.toHaveBeenCalled();
    input.remove();
    spyOn(document.body, 'getBoundingClientRect').and.returnValue({ left: 0, right: 1200, top: 0, bottom: 3000 } as DOMRect);
    fixture.componentInstance.keepFocusedFieldVisible();
    expect(scroll).not.toHaveBeenCalled();
    fixture.destroy();
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
