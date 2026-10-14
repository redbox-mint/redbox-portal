import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FieldComponentConfigFrame, FieldComponentConfigOutline, FieldComponentDefinitionFrame, FieldComponentDefinitionOutline } from '../field-component.outline';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import { FieldComponentConfigFrameKindType, FieldComponentConfigKindType, FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType } from '../shared.outline';
import { ContentFieldComponentConfigFrame, ContentFieldComponentConfigOutline } from './content.outline';

export const RelatedObjectDataComponentName = 'RelatedObjectDataComponent' as const;
export type RelatedObjectDataComponentNameType = typeof RelatedObjectDataComponentName;

export interface RelatedObjectSummary {
  oid: string;
  title?: string;
  fields?: Record<string, unknown>;
}

export interface RelatedObjectDataFieldComponentConfigFrame extends ContentFieldComponentConfigFrame {
  dataPath?: string;
  oidProperty?: string;
  relatedFields?: string[];
  relatedObjects?: RelatedObjectSummary[];
  accessDeniedOids?: string[];
  failedOids?: string[];
}

export interface RelatedObjectDataFieldComponentConfigOutline extends RelatedObjectDataFieldComponentConfigFrame, ContentFieldComponentConfigOutline {}

export interface RelatedObjectDataFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: RelatedObjectDataComponentNameType;
  config?: RelatedObjectDataFieldComponentConfigFrame;
}

export interface RelatedObjectDataFieldComponentDefinitionOutline extends RelatedObjectDataFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: RelatedObjectDataComponentNameType;
  config?: RelatedObjectDataFieldComponentConfigOutline;
}

export interface RelatedObjectDataFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: RelatedObjectDataFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RelatedObjectDataFormComponentDefinitionOutline extends RelatedObjectDataFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: RelatedObjectDataFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type RelatedObjectDataTypes =
  | { kind: FieldComponentConfigFrameKindType; class: RelatedObjectDataFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: RelatedObjectDataFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: RelatedObjectDataFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: RelatedObjectDataFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: RelatedObjectDataFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: RelatedObjectDataFormComponentDefinitionOutline };
