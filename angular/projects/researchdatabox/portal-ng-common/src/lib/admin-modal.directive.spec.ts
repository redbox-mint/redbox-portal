import { ElementRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { AdminModalDirective } from './admin-modal.directive';

describe('AdminModalDirective', () => {
  let host: HTMLElement;
  let dialog: HTMLElement;
  let directive: AdminModalDirective;
  beforeEach(() => {
    host = document.createElement('div');
    host.innerHTML = '<header><button>Trigger</button></header><main><section>Background</section><div role="dialog"><button>Cancel</button></div></main><footer inert>Footer</footer>';
    document.body.append(host);
    host.querySelector('button')!.focus();
    dialog = host.querySelector('[role="dialog"]')!;
    directive = new AdminModalDirective(new ElementRef(dialog));
  });
  afterEach(() => { directive.ngOnDestroy(); host.remove(); });

  it('makes the whole background inert and restores the trigger and original inert state', fakeAsync(() => {
    const anchor = document.createElement('span');
    anchor.className = 'cdk-focus-trap-anchor';
    dialog.before(anchor);
    directive.ngAfterViewInit();
    expect(anchor.inert).toBeFalse();
    expect(host.querySelector('header')!.inert).toBeTrue();
    expect(host.querySelector('section')!.inert).toBeTrue();
    expect(dialog.closest('[inert]')).toBeNull();
    dialog.querySelector('button')!.focus();
    directive.rbAdminModal = false;
    directive.ngOnChanges();
    tick();
    expect(host.querySelector('header')!.inert).toBeFalse();
    expect(host.querySelector('section')!.inert).toBeFalse();
    expect(host.querySelector('footer')!.inert).toBeTrue();
    expect(document.activeElement).toBe(host.querySelector('header button'));
  }));

  it('keeps the background inert until a nested dialog also closes', fakeAsync(() => {
    directive.ngAfterViewInit();
    const nested = document.createElement('div');
    nested.innerHTML = '<button>Nested cancel</button>';
    dialog.append(nested);
    const second = new AdminModalDirective(new ElementRef(nested));
    second.ngAfterViewInit();
    directive.ngOnDestroy();
    expect(host.querySelector('header')!.inert).toBeTrue();
    second.ngOnDestroy();
    tick();
    expect(host.querySelector('header')!.inert).toBeFalse();
  }));
  it('leaves template-owned inert regions alone when Angular clears them on close', fakeAsync(() => {
    const background = host.querySelector('section')!;
    background.inert = true;
    directive.ngAfterViewInit();
    background.inert = false;
    directive.ngOnDestroy();
    tick();
    expect(background.inert).toBeFalse();
  }));

});
