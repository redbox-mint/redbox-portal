import { Component, Input } from '@angular/core';
@Component({
  selector: 'rb-admin-source-card',
  template: `<div class="rb-source-card">
    <div class="rb-source-description">
      <div class="rb-source-title">{{ name }} <ng-content select="[sourceBadge]"></ng-content></div>
      <div class="rb-admin-hint"><ng-content></ng-content></div>
    </div>
    <div class="rb-source-actions"><ng-content select="[sourceActions]"></ng-content></div>
  </div>`,
  styleUrls: ['./admin-source-card.component.scss'],
})
export class AdminSourceCardComponent {
  @Input() name = '';
}
