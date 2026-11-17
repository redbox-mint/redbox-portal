import { ElementRef } from '@angular/core';
import { AdminTabsDirective } from './admin-tabs.directive';

describe('AdminTabsDirective', () => {
  let host: HTMLElement;
  let directive: AdminTabsDirective;
  beforeEach(() => {
    host = document.createElement('div');
    host.innerHTML = '<button role="tab">One</button><button role="tab" disabled>Disabled</button><button role="tab"><span>Three</span></button>';
    document.body.append(host);
    directive = new AdminTabsDirective(new ElementRef(host));
    host.addEventListener('keydown', event => directive.onKeydown(event));
  });
  afterEach(() => host.remove());

  it('wraps across enabled tabs and activates the focused tab', () => {
    const tabs = host.querySelectorAll('button');
    const activate = spyOn(tabs[2], 'click');
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(activate).toHaveBeenCalled();
    expect(document.activeElement).toBe(tabs[2]);
    tabs[2].querySelector('span')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('leaves Tab and Escape to the browser and parent dialogs', () => {
    for (const key of ['Tab', 'Escape']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      host.querySelector('button')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBeFalse();
    }
  });
});
