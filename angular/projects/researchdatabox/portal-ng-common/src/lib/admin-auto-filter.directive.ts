import { Directive, EventEmitter, HostListener, OnDestroy, Output } from '@angular/core';

/** Shared live filters: debounce text, apply other controls and Enter immediately. */
@Directive({ selector: 'form[rbAdminAutoFilter]', standalone: true })
export class AdminAutoFilterDirective implements OnDestroy {
  @Output() rbAdminFilter = new EventEmitter<void>();
  private timer?: ReturnType<typeof setTimeout>;

  @HostListener('input', ['$event.target'])
  onInput(element: EventTarget | null): void {
    if (!(element instanceof HTMLInputElement)) return;
    const target = element;
    if (this.isText(target)) {
      this.cancel();
      this.timer = setTimeout(() => this.apply(), 400);
    }
  }

  @HostListener('change', ['$event.target'])
  onChange(element: EventTarget | null): void {
    if (!(element instanceof HTMLElement)) return;
    const target = element;
    // Datepickers emit ngModelChange, including calendar selections, in the template.
    if (!this.isText(target) && !target.hasAttribute('bsDatepicker')) this.apply();
  }

  @HostListener('keydown.enter', ['$event'])
  onEnter(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.tagName !== 'INPUT' || (event as KeyboardEvent).isComposing) return;
    event.preventDefault();
    this.apply();
  }

  @HostListener('submit')
  @HostListener('reset')
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  @HostListener('click', ['$event.target'])
  onClick(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('button')) this.cancel();
  }

  private isText(target: HTMLElement): boolean {
    return target instanceof HTMLInputElement && ['text', 'search', 'email'].includes(target.type)
      && !target.hasAttribute('bsDatepicker');
  }

  private apply(): void {
    this.cancel();
    this.rbAdminFilter.emit();
  }

  ngOnDestroy(): void { this.cancel(); }
}
