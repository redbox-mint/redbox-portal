import { Directive, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';

/** Close row actions with a visible focus target before a dialog remembers its trigger. */
@Directive({ selector: 'details[rbAdminOverflow]', standalone: true })
export class AdminOverflowDirective implements OnInit, OnDestroy {
  constructor(private element: ElementRef<HTMLDetailsElement>) {}

  private activate = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('button, a');
    if (action && this.element.nativeElement.contains(action) && !action.closest('summary')) this.close();
  };

  ngOnInit(): void { this.element.nativeElement.addEventListener('click', this.activate, true); }
  ngOnDestroy(): void { this.element.nativeElement.removeEventListener('click', this.activate, true); }

  @HostListener('keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.element.nativeElement.open) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }

  private close(): void {
    this.element.nativeElement.open = false;
    this.element.nativeElement.querySelector('summary')?.focus({ preventScroll: true });
  }
}
