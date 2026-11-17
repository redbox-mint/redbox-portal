import { ElementRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { AdminOverflowDirective } from './admin-overflow.directive';
import { AdminModalDirective } from './admin-modal.directive';

describe('AdminOverflowDirective', () => {
  let host: HTMLDivElement;
  let menu: HTMLDetailsElement;
  let directive: AdminOverflowDirective;
  beforeEach(() => {
    host = document.createElement('div');
    host.innerHTML = '<details open><summary>Actions</summary><div><button><span>Delete</span></button></div></details>';
    document.body.append(host);
    menu = host.querySelector('details')!;
    directive = new AdminOverflowDirective(new ElementRef(menu));
    directive.ngOnInit();
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') directive.onEscape(event); });
  });
  afterEach(() => { directive.ngOnDestroy(); host.remove(); });

  it('closes on Escape, returns focus to the summary and consumes the event', () => {
    menu.querySelector('button')!.focus();
    const parentEscape = jasmine.createSpy('parentEscape');
    host.addEventListener('keydown', parentEscape);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    menu.querySelector('button')!.dispatchEvent(event);
    expect(menu.open).toBeFalse();
    expect(document.activeElement).toBe(menu.querySelector('summary'));
    expect(parentEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeTrue();
  });

  it('focuses the summary before the action opens a modal and restores it on close', fakeAsync(() => {
    let modal!: AdminModalDirective;
    const dialog = document.createElement('div');
    dialog.innerHTML = '<button>Cancel</button>';
    menu.querySelector('button')!.addEventListener('click', () => {
      expect(document.activeElement).toBe(menu.querySelector('summary'));
      host.append(dialog);
      modal = new AdminModalDirective(new ElementRef(dialog));
      modal.ngAfterViewInit();
      dialog.querySelector('button')!.focus();
    });
    menu.querySelector('button')!.focus();
    menu.querySelector('span')!.click();
    expect(menu.open).toBeFalse();
    modal.ngOnDestroy(); dialog.remove(); tick();
    expect(document.activeElement).toBe(menu.querySelector('summary'));
  }));

  it('leaves summary toggling alone and removes the capture listener on destroy', () => {
    menu.querySelector('summary')!.click();
    expect(menu.open).toBeFalse();
    menu.open = true;
    directive.ngOnDestroy();
    menu.querySelector('button')!.click();
    expect(menu.open).toBeTrue();
  });
});
