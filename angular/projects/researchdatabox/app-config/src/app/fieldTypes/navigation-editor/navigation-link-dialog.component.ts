import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({ selector: 'rb-navigation-link-dialog', standalone: false, template: `
  <div class="modal-backdrop fade show"></div>
  <div class="modal d-block" role="dialog" aria-modal="true" aria-labelledby="navigation-link-title" (keydown.escape)="cancel.emit(); $event.stopPropagation()">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" rbAdminModal cdkTrapFocus cdkTrapFocusAutoCapture><div class="modal-content">
      <div class="modal-header"><h2 class="modal-title" id="navigation-link-title">{{ (mode === 'add' ? 'admin-navigation-add-child' : 'admin-navigation-edit-link') | i18next }}</h2><button type="button" class="btn-close" [attr.aria-label]="'admin-config-close' | i18next" (click)="cancel.emit()"></button></div>
      <div class="modal-body"><rb-navigation-fields [item]="item" prefix="navigation-child" (fieldChange)="update($event)"></rb-navigation-fields></div>
      <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" (click)="cancel.emit()">{{ 'admin-navigation-cancel' | i18next }}</button><button type="button" class="btn btn-primary" [disabled]="!valid" (click)="save.emit()">{{ 'admin-navigation-apply' | i18next }}</button></div>
    </div></div>
  </div>` })
export class NavigationLinkDialogComponent {
  @Input() item: any = {};
  @Input() mode = 'edit';
  @Input() requireId = false;
  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  get valid(): boolean { return !!(this.item.labelKey?.trim() && this.item.href?.trim() && (!this.requireId || this.item.id?.trim())); }
  update(change: { field: string; value: any }): void { this.item[change.field] = change.value; }
}
