import { Component } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { ContentComponentConfig } from '@researchdatabox/sails-ng-common/dist/src/config/component/textblock.model';
import { get as _get, isUndefined as _isUndefined } from 'lodash-es';

// *** Migration Notes ***
// This component will replace legacy components: ContentComponent and HtmlRawComponent
// 
// Use Cases:
// - show value of SimpleInputComponent in view mode
// - show value of generated data from server-side in a HTML span
// - show value of static text/content that is not saved to the server side metadata
// - set on load / init, if needs to be changed, that's what expressions are for
// 
@Component({
    selector: 'redbox-textblock',
    template: `
    @if (getBooleanProperty('visible')) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <span [innerHtml]="content"></span>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
    `,
    standalone: false
})
export class ContentComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "ContentComponent";

  public content:string = '';
  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    if(!_isUndefined(this.componentDefinition?.config)) {
      let contentConfig:ContentComponentConfig = this.componentDefinition.config as ContentComponentConfig;
      
      // The below template is a reference that needs to be taken into account for legacy compatibility
      //
      // <span *ngSwitchCase="'h1'" role="heading" aria-level="1" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h2'" role="heading" aria-level="2" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h3'" role="heading" aria-level="3" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h4'" role="heading" aria-level="4" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h5'" role="heading" aria-level="5" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h6'" role="heading" aria-level="6" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <hr *ngSwitchCase="'hr'" [ngClass]="field.cssClasses">
      // <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.label == null? '' : field.label + ': '}}{{field.value == null? '' : field.value}}</span>
      // <p *ngSwitchDefault [ngClass]="field.cssClasses" [innerHtml]="field.value == null? '' : field.value"></p>
      //
      switch(contentConfig.contentType) {
        case 'h1':
          this.content = `<h1>${contentConfig.content}</h1>`;
        break;
        case 'h2':
          this.content = `<h2>${contentConfig.content}</h2>`;
        break;
        case 'h3':
          this.content = `<h3>${contentConfig.content}</h3>`;
        break;
        case 'h4':
          this.content = `<h4>${contentConfig.content}</h4>`;
        break;
        case 'h5':
          this.content = `<h5>${contentConfig.content}</h5>`;
        break;
        case 'h6':
          this.content = `<h6>${contentConfig.content}</h6>`;
        break;
        case 'hr':
          this.content = `<hr>${contentConfig.content}</hr>`;
        break;
        case 'p':
          this.content = `<p>${contentConfig.content}</p>`;
        break;
        case 'span':
          this.content = `<span>${contentConfig.content}</span>`;
        break;
        default:
          if (_get(contentConfig, 'template', '').indexOf('<%') != -1) {
            this.content = this.lodashTemplateUtilityService.runTemplate(contentConfig.template, this.componentDefinition.config, {}, this, this.getFormGroupFromAppRef()?.value);
          } else {
            this.content = contentConfig.content ?? '';
          }
        break;
      }
    }
  }
}
