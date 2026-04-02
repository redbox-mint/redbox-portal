import { FieldLayoutConfig, FieldLayoutDefinition } from '../field-layout.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import {
  ActionRowAlignmentOptionsType,
  ActionRowFieldLayoutConfigOutline,
  ActionRowFieldLayoutDefinitionOutline,
  ActionRowLayoutName,
} from './action-row-layout.outline';
import { FieldLayoutConfigKind, FieldLayoutDefinitionKind } from '../shared.outline';

export class ActionRowFieldLayoutConfig extends FieldLayoutConfig implements ActionRowFieldLayoutConfigOutline {
  hostCssClasses = 'rb-form-action-row-layout';
  containerCssClass = 'rb-form-action-row';
  alignment: ActionRowAlignmentOptionsType = 'end';
  wrap = true;
  slotCssClass = 'rb-form-action-slot';
  compact = false;

  constructor() {
    super();
  }
}

export class ActionRowFieldLayoutDefinition extends FieldLayoutDefinition implements ActionRowFieldLayoutDefinitionOutline {
  class = ActionRowLayoutName;
  config?: ActionRowFieldLayoutConfigOutline;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitActionRowFieldLayoutDefinition(this);
  }
}

export const ActionRowLayoutMap = [
  { kind: FieldLayoutConfigKind, def: ActionRowFieldLayoutConfig },
  { kind: FieldLayoutDefinitionKind, def: ActionRowFieldLayoutDefinition, class: ActionRowLayoutName },
];
export const ActionRowLayoutDefaults = {};
