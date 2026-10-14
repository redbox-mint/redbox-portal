import { Component } from '@angular/core';
import { ContentFieldComponentConfig, RelatedObjectDataComponentName, RelatedObjectDataFieldComponentConfig } from '@researchdatabox/sails-ng-common';
import { ContentComponent } from './content.component';

@Component({
  selector: 'redbox-related-object-data',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <span class="rb-form-content" [class.rb-form-rich-text-content]="isRichTextContent" [innerHtml]="content"></span>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false,
})
export class RelatedObjectDataComponent extends ContentComponent {
  protected override logName = RelatedObjectDataComponentName;

  protected override shouldRenderWithTemplate(config: ContentFieldComponentConfig): boolean {
    return !!config?.template;
  }

  protected override buildTemplateContext(config: RelatedObjectDataFieldComponentConfig, formData: Record<string, unknown>): Record<string, unknown> {
    return {
      ...super.buildTemplateContext(config, formData),
      relatedObjects: config.relatedObjects ?? [],
      accessDeniedOids: config.accessDeniedOids ?? [],
      failedOids: config.failedOids ?? [],
    };
  }
}
