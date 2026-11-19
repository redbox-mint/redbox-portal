import { ChangeDetectionStrategy } from '@angular/core';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
@Component({ changeDetection: ChangeDetectionStrategy.Default, selector: 'profile-value', standalone: true, imports: [FormsModule, I18NextPipe], template: `
  @switch (type) {
    @case ('boolean') { <select class="form-select" [id]="inputId" [ngModel]="value" (ngModelChange)="valueChange.emit($event)"><option [ngValue]="null">{{ 'ai-profiles-no-answer' | i18next }}</option><option [ngValue]="true">{{ 'ai-profiles-yes' | i18next }}</option><option [ngValue]="false">{{ 'ai-profiles-no' | i18next }}</option></select> }
    @case ('enum') { <select class="form-select" [id]="inputId" [ngModel]="value" (ngModelChange)="valueChange.emit($event)"><option [ngValue]="null">{{ 'ai-profiles-no-answer' | i18next }}</option>@for (o of options; track o.value) { <option [ngValue]="o.value">{{ o.label || (o.labelKey | i18next) }}</option> }</select> }
    @case ('multiEnum') { <select class="form-select" multiple [id]="inputId" [ngModel]="value || []" (ngModelChange)="valueChange.emit($event)">@for (o of options; track o.value) { <option [ngValue]="o.value">{{ o.label || (o.labelKey | i18next) }}</option> }</select> }
    @case ('date') { <input class="form-control" type="date" [id]="inputId" [ngModel]="value" (ngModelChange)="valueChange.emit($event)"> }
    @default { <textarea class="form-control" [rows]="type === 'text' ? 2 : 3" [id]="inputId" [ngModel]="value" (ngModelChange)="valueChange.emit($event)" [attr.maxlength]="maxLength || null"></textarea> }
  }` })
export class ProfileValueComponent {
  @Input() inputId = '';
  @Input() type = 'text';
  @Input() value: any = null;
  @Input() maxLength?: number;
  @Input() options: Array<{ value: string; label?: string; labelKey?: string }> = [];
  @Output() valueChange = new EventEmitter<any>();
}
