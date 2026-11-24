import {
  FieldComponentConfigFrameKindType,
  FieldComponentConfigKindType,
  FieldComponentDefinitionFrameKindType,
  FieldComponentDefinitionKindType,
  FieldModelConfigFrameKindType,
  FieldModelConfigKindType,
  FieldModelDefinitionFrameKindType,
  FieldModelDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from '../shared.outline';
import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from '../field-component.outline';

import {
  FieldModelConfigFrame,
  FieldModelConfigOutline,
  FieldModelDefinitionFrame,
  FieldModelDefinitionOutline,
} from '../field-model.outline';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import type { HistoricalVocabMode } from './dropdown-input.outline';

import type { CheckboxOption } from './checkbox-input.outline';
import type {
  SimpleInputFormComponentDefinitionFrame,
  SimpleInputFormComponentDefinitionOutline,
} from './simple-input.outline';
import type { TextAreaFormComponentDefinitionFrame, TextAreaFormComponentDefinitionOutline } from './text-area.outline';

/* Checkbox With Details Component */
export const CheckboxWithDetailsComponentName = 'CheckboxWithDetailsComponent' as const;
export type CheckboxWithDetailsComponentNameType = typeof CheckboxWithDetailsComponentName;

export interface CheckboxWithDetailsOption extends CheckboxOption {
  /** Resolved by the vocabulary visitor for retired entries. */
  historical?: boolean;
}

type TextInputField<T extends SimpleInputFormComponentDefinitionFrame> = T & {
  component: { config?: { type?: 'text' } };
};

export type CheckboxDetailFieldFrame =
  | TextInputField<SimpleInputFormComponentDefinitionFrame>
  | TextAreaFormComponentDefinitionFrame;
export type CheckboxDetailFieldOutline =
  | TextInputField<SimpleInputFormComponentDefinitionOutline>
  | TextAreaFormComponentDefinitionOutline;

export interface CheckboxWithDetailsFieldComponentConfigFrame extends FieldComponentConfigFrame {
  options?: CheckboxWithDetailsOption[];
  detailFields?: CheckboxDetailFieldFrame[];
  detailFieldsByValue?: Record<string, CheckboxDetailFieldFrame[]>;
  vocabRef?: string;
  inlineVocab?: boolean;
  /** When set, options whose value is not listed are disabled. */
  enabledOptionValues?: string[] | null;
  historicalVocabMode?: HistoricalVocabMode;
}

export interface CheckboxWithDetailsFieldComponentConfigOutline
  extends CheckboxWithDetailsFieldComponentConfigFrame, FieldComponentConfigOutline {
  detailFields?: CheckboxDetailFieldOutline[];
  detailFieldsByValue?: Record<string, CheckboxDetailFieldOutline[]>;
}

export interface CheckboxWithDetailsFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: CheckboxWithDetailsComponentNameType;
  config?: CheckboxWithDetailsFieldComponentConfigFrame;
}

export interface CheckboxWithDetailsFieldComponentDefinitionOutline
  extends CheckboxWithDetailsFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: CheckboxWithDetailsComponentNameType;
  config?: CheckboxWithDetailsFieldComponentConfigOutline;
}

/* Checkbox With Details Model */
export const CheckboxWithDetailsModelName = 'CheckboxWithDetailsModel' as const;
export type CheckboxWithDetailsModelNameType = typeof CheckboxWithDetailsModelName;
export interface CheckboxWithDetailsRow {
  value: string;
  details: Record<string, string | null>;
}
export type CheckboxWithDetailsModelValueType = CheckboxWithDetailsRow[];

export interface CheckboxWithDetailsFieldModelConfigFrame extends FieldModelConfigFrame<CheckboxWithDetailsModelValueType> {}

export interface CheckboxWithDetailsFieldModelConfigOutline
  extends CheckboxWithDetailsFieldModelConfigFrame, FieldModelConfigOutline<CheckboxWithDetailsModelValueType> {}

export interface CheckboxWithDetailsFieldModelDefinitionFrame extends FieldModelDefinitionFrame<CheckboxWithDetailsModelValueType> {
  class: CheckboxWithDetailsModelNameType;
  config?: CheckboxWithDetailsFieldModelConfigFrame;
}

export interface CheckboxWithDetailsFieldModelDefinitionOutline
  extends CheckboxWithDetailsFieldModelDefinitionFrame, FieldModelDefinitionOutline<CheckboxWithDetailsModelValueType> {
  class: CheckboxWithDetailsModelNameType;
  config?: CheckboxWithDetailsFieldModelConfigOutline;
}

/* Checkbox With Details Form Component */
export interface CheckboxWithDetailsFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: CheckboxWithDetailsFieldComponentDefinitionFrame;
  model?: CheckboxWithDetailsFieldModelDefinitionFrame;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

/**
 * Stores an array of selected option codes and the text details entered for each option.
 *
 * @extensionPoint Use `CheckboxWithDetailsComponent` with `CheckboxWithDetailsModel`; define shared detailFields and option-specific detailFieldsByValue using stable option codes.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Record-Forms
 */
export interface CheckboxWithDetailsFormComponentDefinitionOutline
  extends CheckboxWithDetailsFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: CheckboxWithDetailsFieldComponentDefinitionOutline;
  model?: CheckboxWithDetailsFieldModelDefinitionOutline;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type CheckboxWithDetailsTypes =
  | { kind: FieldComponentConfigFrameKindType; class: CheckboxWithDetailsFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: CheckboxWithDetailsFieldComponentDefinitionFrame }
  | { kind: FieldModelConfigFrameKindType; class: CheckboxWithDetailsFieldModelConfigFrame }
  | { kind: FieldModelDefinitionFrameKindType; class: CheckboxWithDetailsFieldModelDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: CheckboxWithDetailsFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: CheckboxWithDetailsFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: CheckboxWithDetailsFieldComponentDefinitionOutline }
  | { kind: FieldModelConfigKindType; class: CheckboxWithDetailsFieldModelConfigOutline }
  | { kind: FieldModelDefinitionKindType; class: CheckboxWithDetailsFieldModelDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: CheckboxWithDetailsFormComponentDefinitionOutline };
