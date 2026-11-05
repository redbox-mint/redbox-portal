import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

/** Shared list row; confirmation belongs to the row so every removal uses the same guard. */
@Component({
  selector: 'rb-navigation-row', standalone: false,
  templateUrl: './navigation-row.component.html'
})
export class NavigationRowComponent {
  @Input() item: any = {};
  @Input() label = '';
  @Input() position = 0;
  @Input() count = 0;
  @Input() selected = false;
  @Input() canAddChild = false;
  @Input() container = false;
  @Input() byItem = false;
  @Output() selectItem = new EventEmitter<void>();
  @Output() action = new EventEmitter<string>();
  confirming = false;
  constructor(private element: ElementRef<HTMLElement>) {}
  get visibility(): string {
    if (this.byItem) return 'admin-navigation-by-item';
    return this.item.hideWhenAuth ? 'admin-navigation-signed-out' : this.item.requiresAuth !== false ? 'admin-navigation-signed-in' : 'admin-navigation-everyone';
  }
  run(action: string): void {
    this.closeMenu();
    if (action === 'remove') this.confirming = true;
    else this.action.emit(action);
  }
  closeMenu(): void {
    const details = this.element.nativeElement.querySelector('details');
    if (details?.open) { details.open = false; details.querySelector('summary')?.focus(); }
  }
  @HostListener('document:click', ['$event']) outside(event: MouseEvent): void {
    if (!this.element.nativeElement.contains(event.target as Node)) {
      const details = this.element.nativeElement.querySelector('details');
      if (details) details.open = false;
    }
  }
}
