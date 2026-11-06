import { Component } from '@angular/core';
import { FieldType, FormlyFieldConfig } from '@ngx-formly/core';

@Component({
  selector: 'app-config-section',
  standalone: false,
  template: `
    @if (props['collapsible']) {
      <details class="rb-admin-form-section" [id]="props['sectionId']" [open]="props['expanded']" (toggle)="toggle($event)">
        <summary class="rb-admin-form-section-header">
          <div class="app-config-section-title"><h2>{{ props.label }}</h2>
            @if (props['expanded'] && props.description) { <p>{{ props.description }}</p> }
            @if (!props['expanded']) {
              <p class="app-config-summary">
                @for (part of props['summaryParts'](); track $index) {
                  @if ($index) { <span class="app-config-summary-separator">·</span> }<span>{{ part.label }}: </span>@if (part.mono) { <code>{{ part.value }}</code> } @else { <span>{{ part.value }}</span> }
                } @empty { {{ props['summary']() || ('admin-config-no-values' | i18next) }} }
              </p>
            }
          </div>
          <span class="app-config-section-actions">
            @if (enabledField; as enabled) { <span (click)="$event.stopPropagation()" (keydown)="switchKeydown($event)"><formly-field [field]="enabled"></formly-field></span> }
            <span class="app-config-expand">{{ (props['expanded'] ? 'admin-config-collapse' : 'admin-config-expand') | i18next }} <i class="fa" [class.fa-angle-down]="!props['expanded']" [class.fa-angle-up]="props['expanded']" aria-hidden="true"></i></span>
          </span>
        </summary>
        <div class="rb-admin-form-section-body" [class.app-config-settings-off]="enabledField?.formControl?.value === false">@if (enabledField?.formControl?.value === false && !options.formState?.pageIsOff?.()) { <p class="rb-admin-hint">{{ 'admin-config-off-kept' | i18next }}</p> }<ng-container *ngTemplateOutlet="body"></ng-container></div>
      </details>
    } @else {
      <section class="rb-admin-form-section" [id]="props['sectionId']">
        <div class="rb-admin-form-section-header"><div><h2>{{ props.label }}</h2>
          @if (props.description) { <p>{{ props.description }}</p> }
        </div>
          @if (enabledField; as enabled) { <formly-field [field]="enabled"></formly-field> }
        </div>
        <div class="rb-admin-form-section-body" [class.app-config-settings-off]="enabledField?.formControl?.value === false">@if (enabledField?.formControl?.value === false && !options.formState?.pageIsOff?.()) { <p class="rb-admin-hint">{{ 'admin-config-off-kept' | i18next }}</p> }<ng-container *ngTemplateOutlet="body"></ng-container></div>
      </section>
    }
    <ng-template #body>
      @for (child of field.fieldGroup; track child) {
        @if (!child.props?.['pageEnabled']) { <formly-field [field]="child"></formly-field> }
      }
    </ng-template>
  `
})
export class SectionTypeComponent extends FieldType {
  get enabledField(): FormlyFieldConfig | undefined {
    const children = this.field.fieldGroup || [];
    return children.find(child => child.props?.['pageEnabled']) ||
      (children.length === 1 ? children[0].fieldGroup?.find(child => child.props?.['headerEnabled']) : undefined);
  }

  switchKeydown(event: KeyboardEvent): void {
    if ([' ', 'Enter'].includes(event.key)) event.stopPropagation();
  }

  toggle(event: Event): void {
    this.props['expanded'] = (event.target as HTMLDetailsElement).open;
    if (this.props['expanded']) this.props['activate']?.();
  }
}
