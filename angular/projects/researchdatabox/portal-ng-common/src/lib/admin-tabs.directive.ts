import { Directive, ElementRef, HostListener } from '@angular/core';

/** Automatic-activation tabs. Selection and roving tabindex remain bound to the view model. */
@Directive({ selector: '[rbAdminTabs]', standalone: true })
export class AdminTabsDirective {
  constructor(private element: ElementRef<HTMLElement>) {}

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const tabs = Array.from(this.element.nativeElement.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .filter(tab => !tab.disabled && !tab.hidden);
    const index = tabs.indexOf((event.target as HTMLElement).closest('[role="tab"]') as HTMLButtonElement);
    if (index < 0) return;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
      case 'ArrowRight': next = (index + 1) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  }
}
