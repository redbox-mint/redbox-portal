import { FieldLayoutConfig, FieldLayoutDefinition } from '../field-layout.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import {
  InlineFieldLayoutConfigOutline,
  InlineFieldLayoutDefinitionOutline,
  InlineLayoutName,
} from './inline-layout.outline';
import { FieldLayoutConfigKind, FieldLayoutDefinitionKind } from '../shared.outline';

export class InlineFieldLayoutConfig extends FieldLayoutConfig implements InlineFieldLayoutConfigOutline {
  constructor() {
    super();
  }
}

export class InlineFieldLayoutDefinition extends FieldLayoutDefinition implements InlineFieldLayoutDefinitionOutline {
  class = InlineLayoutName;
  config?: InlineFieldLayoutConfigOutline;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitInlineFieldLayoutDefinition(this);
  }
}

export const InlineLayoutMap = [
  { kind: FieldLayoutConfigKind, def: InlineFieldLayoutConfig },
  { kind: FieldLayoutDefinitionKind, def: InlineFieldLayoutDefinition, class: InlineLayoutName },
];
export const InlineLayoutDefaults = {};
