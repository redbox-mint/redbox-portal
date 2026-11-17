import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';

@Component({
  selector: 'ai-model-chips', standalone: true, imports: [FormsModule, I18NextPipe],
  template: `
    <div class="ai-chips">
      @for (value of values; track $index; let i = $index) {
        <span class="rb-admin-chip"><code>{{ value }}</code>
          @if (!disabled) { <button type="button" class="btn btn-sm btn-outline-secondary" (click)="remove(i)"
            [attr.aria-label]="'ai-models-remove-item' | i18next: { value: value }">×</button> }
        </span>
      }
      @if (!disabled) {
        <input class="form-control" [id]="inputId" [(ngModel)]="pending" [attr.aria-label]="label"
          [disabled]="values.length >= max" (keydown.enter)="$event.preventDefault(); add()">
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="add()" [disabled]="!pending.trim() || values.length >= max">{{ 'ai-models-add-item' | i18next }}</button>
      }
    </div>`,
})
export class ChipsComponent {
  @Input() values: string[] = [];
  @Input() disabled = false;
  @Input() max = 100;
  @Input() inputId = '';
  @Input() label = '';
  @Output() valuesChange = new EventEmitter<string[]>();
  pending = '';
  add(): void {
    if (this.disabled || !this.pending.trim() || this.values.length >= this.max) return;
    this.valuesChange.emit([...this.values, this.pending.trim()]); this.pending = '';
  }
  remove(index: number): void { this.valuesChange.emit(this.values.filter((_, i) => i !== index)); }
}
