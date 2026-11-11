import { signal, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, Output } from '@angular/core';
import { I18NextPipe } from './i18next.pipe';

/** Keep the existing save action within reach before a long editor's save bar enters view. */
@Component({
  selector: 'rb-admin-save-shortcut',
  standalone: true,
  imports: [I18NextPipe],
  template: `@if (dirty && offscreen) {
    <div class="rb-admin-save-shortcut">
      <span>{{ 'admin-config-unsaved' | i18next }} ·</span>
      <button type="button" class="btn btn-primary btn-sm" [disabled]="disabled" (click)="save.emit()">{{ 'admin-config-save' | i18next }}</button>
    </div>
  }`
})
export class AdminSaveShortcutComponent implements OnChanges, OnDestroy {
  @Input() bar?: ElementRef<HTMLElement>;
  @Input() dirty = false;
  @Input() disabled = false;
  @Output() save = new EventEmitter<void>();
  private readonly offscreenState = signal(false);
  get offscreen(): boolean { return this.offscreenState(); }
  set offscreen(value: boolean) { this.offscreenState.set(value); }
  private observer?: IntersectionObserver;
  private observed?: HTMLElement;
  private focusFrame = 0;

  constructor(private zone: NgZone, private host: ElementRef<HTMLElement>) {}

  @HostListener('document:input')
  scheduleFocusCheck(): void {
    cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => this.keepFocusedFieldVisible());
  }

  @HostListener('document:focusin')
  keepFocusedFieldVisible(): void {
    const focused = document.activeElement;
    const shortcut = this.host.nativeElement.firstElementChild;
    if (!(focused instanceof HTMLElement) || !focused.matches('input, select, textarea, [contenteditable="true"]') ||
      !shortcut || this.host.nativeElement.contains(focused)) return;
    const field = focused.getBoundingClientRect();
    const pill = shortcut.getBoundingClientRect();
    if (field.left < pill.right && field.right > pill.left && field.bottom > pill.top - 12 && field.top < pill.bottom) {
      window.scrollBy({ top: field.bottom - pill.top + 12, behavior: 'instant' });
    }
  }

  ngOnChanges(): void {
    this.scheduleFocusCheck();
    const element = this.bar?.nativeElement;
    if (element === this.observed) return;
    this.observer?.disconnect();
    this.observed = element;
    this.offscreen = false;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    this.offscreen = rect.bottom <= 0 || rect.top >= window.innerHeight;
    this.observer = new IntersectionObserver(entries => this.zone.run(() => {
      this.offscreen = !entries[0].isIntersecting;
    }));
    this.observer.observe(element);
  }

  ngOnDestroy(): void { this.observer?.disconnect(); cancelAnimationFrame(this.focusFrame); }
}
