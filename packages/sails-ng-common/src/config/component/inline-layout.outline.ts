import {
  FieldLayoutConfigFrame,
  FieldLayoutConfigOutline,
  FieldLayoutDefinitionFrame,
  FieldLayoutDefinitionOutline,
} from '../field-layout.outline';
import {
  FieldLayoutConfigFrameKindType,
  FieldLayoutConfigKindType,
  FieldLayoutDefinitionFrameKindType,
  FieldLayoutDefinitionKindType,
} from '../shared.outline';

export const InlineLayoutName = `InlineLayout` as const;
export type InlineLayoutNameType = typeof InlineLayoutName;

export interface InlineFieldLayoutConfigFrame extends FieldLayoutConfigFrame {}

export interface InlineFieldLayoutConfigOutline extends InlineFieldLayoutConfigFrame, FieldLayoutConfigOutline {}

export interface InlineFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
  class: InlineLayoutNameType;
  config?: InlineFieldLayoutConfigFrame;
}

export interface InlineFieldLayoutDefinitionOutline extends InlineFieldLayoutDefinitionFrame, FieldLayoutDefinitionOutline {
  class: InlineLayoutNameType;
  config?: InlineFieldLayoutConfigOutline;
}

export type InlineLayoutTypes =
  | { kind: FieldLayoutConfigFrameKindType; class: InlineFieldLayoutConfigFrame }
  | { kind: FieldLayoutConfigKindType; class: InlineFieldLayoutConfigOutline }
  | { kind: FieldLayoutDefinitionFrameKindType; class: InlineFieldLayoutDefinitionFrame }
  | { kind: FieldLayoutDefinitionKindType; class: InlineFieldLayoutDefinitionOutline };
