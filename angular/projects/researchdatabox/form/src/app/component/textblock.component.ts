import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from '@researchdatabox/portal-ng-common';

export class TextBlockModel extends FormFieldModel<string> {
}

@Component({
    selector: 'redbox-textblock',
    template: `
    @if (getBooleanProperty('visible')) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <ng-container [ngSwitch]="tag">
        <h1 *ngSwitchCase="'h1'" >{{ model?.getValue() ? model?.getValue() : '' }}</h1>
        <h2 *ngSwitchCase="'h2'" >{{ model?.getValue() ? model?.getValue() : '' }}</h2>
        <h3 *ngSwitchCase="'h3'" >{{ model?.getValue() ? model?.getValue() : '' }}</h3>
        <h4 *ngSwitchCase="'h4'" >{{ model?.getValue() ? model?.getValue() : '' }}</h4>
        <h5 *ngSwitchCase="'h5'" >{{ model?.getValue() ? model?.getValue() : '' }}</h5>
        <h6 *ngSwitchCase="'h6'" >{{ model?.getValue() ? model?.getValue() : '' }}</h6>
        <p *ngSwitchCase="'p'" >{{ model?.getValue() ? model?.getValue() : '' }}</p>
        <span *ngSwitchDefault >{{ model?.getValue() ? model?.getValue() : '' }}</span>
      </ng-container>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
    standalone: false
})
export class TextBlockComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "TextBlockComponent";

  @Input() tag: string = 'p';
  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextBlockModel;

}
