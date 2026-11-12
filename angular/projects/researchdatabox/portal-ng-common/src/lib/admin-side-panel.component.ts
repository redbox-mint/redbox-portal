import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, EventEmitter, Input, OnDestroy, Output, ViewEncapsulation } from '@angular/core';
import { AdminModalDirective } from './admin-modal.directive';
import { I18NextPipe } from './i18next.pipe';

/** Bootstrap offcanvas presentation; CDK owns focus and rbAdminModal excludes portal chrome. */
@Component({
  selector: 'rb-admin-side-panel',
  styleUrls: ['./admin-side-panel.component.scss'],
  encapsulation: ViewEncapsulation.None,
  imports: [CdkTrapFocus, AdminModalDirective, I18NextPipe],
  template: ` <div class="offcanvas-backdrop show" aria-hidden="true" (click)="!busy && closed.emit()"></div>
    <section
      class="offcanvas offcanvas-end show rb-admin-side-panel"
      [class.rb-admin-side-panel-wide]="wide"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      tabindex="-1"
      rbAdminModal
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      (keydown.escape)="escape($event)"
    >
      <header class="offcanvas-header">
        <div>
          <h2 [id]="titleId">{{ title }}</h2>
          <p class="rb-admin-hint">{{ subtitle }}</p>
        </div>
        <button
          type="button"
          class="btn btn-outline-secondary"
          cdkFocusInitial
          [disabled]="busy"
          [attr.aria-label]="'data-grids-close' | i18next"
          (click)="closed.emit()"
        >
          ×
        </button>
      </header>
      <div class="offcanvas-body"><ng-content></ng-content></div>
      <footer class="card-footer"><ng-content select="[panelFooter]"></ng-content></footer>
    </section>`,
})
export class AdminSidePanelComponent implements OnDestroy {
  private static nextId = 0;
  private static openCount = 0;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() wide = false;
  @Input() busy = false;
  @Output() closed = new EventEmitter<void>();
  readonly titleId = 'rb-side-panel-' + ++AdminSidePanelComponent.nextId;
  constructor() {
    AdminSidePanelComponent.openCount++;
    document.documentElement.classList.add('rb-admin-panel-open');
  }
  escape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.busy) this.closed.emit();
  }
  ngOnDestroy(): void {
    if (--AdminSidePanelComponent.openCount === 0) document.documentElement.classList.remove('rb-admin-panel-open');
  }
}
