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

export const ActionRowLayoutName = 'ActionRowLayout' as const;
export type ActionRowLayoutNameType = typeof ActionRowLayoutName;

export const ActionRowAlignmentOptions = ['start', 'end', 'space-between'] as const;
export type ActionRowAlignmentOptionsType = (typeof ActionRowAlignmentOptions)[number];

export interface ActionRowFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
  containerCssClass?: string;
  alignment?: ActionRowAlignmentOptionsType;
  wrap?: boolean;
  slotCssClass?: string;
  compact?: boolean;
}

export interface ActionRowFieldLayoutConfigOutline extends ActionRowFieldLayoutConfigFrame, FieldLayoutConfigOutline {}

export interface ActionRowFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
  class: ActionRowLayoutNameType;
  config?: ActionRowFieldLayoutConfigFrame;
}

export interface ActionRowFieldLayoutDefinitionOutline
  extends ActionRowFieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline {
  class: ActionRowLayoutNameType;
  config?: ActionRowFieldLayoutConfigOutline;
}

export type ActionRowLayoutTypes =
  | { kind: FieldLayoutConfigFrameKindType; class: ActionRowFieldLayoutConfigFrame }
  | { kind: FieldLayoutConfigKindType; class: ActionRowFieldLayoutConfigOutline }
  | { kind: FieldLayoutDefinitionFrameKindType; class: ActionRowFieldLayoutDefinitionFrame }
  | { kind: FieldLayoutDefinitionKindType; class: ActionRowFieldLayoutDefinitionOutline };
