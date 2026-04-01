import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import {
  FieldLayoutConfigFrame,
  FieldLayoutConfigOutline,
  FieldLayoutDefinitionFrame,
  FieldLayoutDefinitionOutline,
} from '../field-layout.outline';
import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from '../field-component.outline';
import {
  FieldComponentConfigFrameKindType,
  FieldComponentConfigKindType,
  FieldComponentDefinitionFrameKindType,
  FieldComponentDefinitionKindType,
  FieldLayoutConfigFrameKindType,
  FieldLayoutConfigKindType,
  FieldLayoutDefinitionFrameKindType,
  FieldLayoutDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from '../shared.outline';
import {
  AvailableFormComponentDefinitionFrames,
  AvailableFormComponentDefinitionOutlines,
} from '../dictionary.outline';

/* Accordion Component */

export const AccordionComponentName = 'AccordionComponent' as const;
export type AccordionComponentNameType = typeof AccordionComponentName;

export const AccordionStartingOpenModeOptions = ['all-open', 'first-open', 'last-open'] as const;
export type AccordionStartingOpenModeOptionsType = (typeof AccordionStartingOpenModeOptions)[number];

export interface AccordionFieldComponentConfigFrame extends FieldComponentConfigFrame {
  panels: AccordionPanelFormComponentDefinitionFrame[];
  startingOpenMode?: AccordionStartingOpenModeOptionsType;
}

export interface AccordionFieldComponentConfigOutline
  extends AccordionFieldComponentConfigFrame,
    FieldComponentConfigOutline {
  panels: AccordionPanelFormComponentDefinitionOutline[];
}

export interface AccordionFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: AccordionComponentNameType;
  config?: AccordionFieldComponentConfigFrame;
}

export interface AccordionFieldComponentDefinitionOutline
  extends AccordionFieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline {
  class: AccordionComponentNameType;
  config?: AccordionFieldComponentConfigOutline;
}

/* Accordion Panel Component */

export const AccordionPanelComponentName = 'AccordionPanelComponent' as const;
export type AccordionPanelComponentNameType = typeof AccordionPanelComponentName;

export interface AccordionPanelFieldComponentConfigFrame extends FieldComponentConfigFrame {
  componentDefinitions: AvailableFormComponentDefinitionFrames[];
}

export interface AccordionPanelFieldComponentConfigOutline
  extends AccordionPanelFieldComponentConfigFrame,
    FieldComponentConfigOutline {
  componentDefinitions: AvailableFormComponentDefinitionOutlines[];
}

export interface AccordionPanelFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: AccordionPanelComponentNameType;
  config?: AccordionPanelFieldComponentConfigFrame;
}

export interface AccordionPanelFieldComponentDefinitionOutline
  extends AccordionPanelFieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline {
  class: AccordionPanelComponentNameType;
  config?: AccordionPanelFieldComponentConfigOutline;
}

/* Accordion Layout */

export const AccordionLayoutName = 'AccordionLayout' as const;
export type AccordionLayoutNameType = typeof AccordionLayoutName;

export interface AccordionFieldLayoutConfigFrame extends FieldLayoutConfigFrame {}

export interface AccordionFieldLayoutConfigOutline
  extends AccordionFieldLayoutConfigFrame,
    FieldLayoutConfigOutline {}

export interface AccordionFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
  class: AccordionLayoutNameType;
  config?: AccordionFieldLayoutConfigFrame;
}

export interface AccordionFieldLayoutDefinitionOutline
  extends AccordionFieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline {
  class: AccordionLayoutNameType;
  config?: AccordionFieldLayoutConfigOutline;
}

/* Accordion Panel Layout */

export const AccordionPanelLayoutName = 'AccordionPanelLayout' as const;
export type AccordionPanelLayoutNameType = typeof AccordionPanelLayoutName;

export interface AccordionPanelFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
  buttonLabel?: string;
}

export interface AccordionPanelFieldLayoutConfigOutline
  extends AccordionPanelFieldLayoutConfigFrame,
    FieldLayoutConfigOutline {}

export interface AccordionPanelFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
  class: AccordionPanelLayoutNameType;
  config?: AccordionPanelFieldLayoutConfigFrame;
}

export interface AccordionPanelFieldLayoutDefinitionOutline
  extends AccordionPanelFieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline {
  class: AccordionPanelLayoutNameType;
  config?: AccordionPanelFieldLayoutConfigOutline;
}

/* Accordion Form Components */

export interface AccordionFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: AccordionFieldComponentDefinitionFrame;
  model?: never;
  layout?: AccordionFieldLayoutDefinitionFrame;
}

export interface AccordionFormComponentDefinitionOutline
  extends AccordionFormComponentDefinitionFrame,
    FormComponentDefinitionOutline {
  component: AccordionFieldComponentDefinitionOutline;
  model?: never;
  layout?: AccordionFieldLayoutDefinitionOutline;
}

export interface AccordionPanelFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: AccordionPanelFieldComponentDefinitionFrame;
  model?: never;
  layout?: AccordionPanelFieldLayoutDefinitionFrame;
}

export interface AccordionPanelFormComponentDefinitionOutline
  extends AccordionPanelFormComponentDefinitionFrame,
    FormComponentDefinitionOutline {
  component: AccordionPanelFieldComponentDefinitionOutline;
  model?: never;
  layout?: AccordionPanelFieldLayoutDefinitionOutline;
}

export type AccordionTypes =
  | { kind: FieldComponentConfigFrameKindType; class: AccordionFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: AccordionFieldComponentDefinitionFrame }
  | { kind: FieldLayoutConfigFrameKindType; class: AccordionFieldLayoutConfigFrame }
  | { kind: FieldLayoutDefinitionFrameKindType; class: AccordionFieldLayoutDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: AccordionFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigFrameKindType; class: AccordionPanelFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: AccordionPanelFieldComponentDefinitionFrame }
  | { kind: FieldLayoutConfigFrameKindType; class: AccordionPanelFieldLayoutConfigFrame }
  | { kind: FieldLayoutDefinitionFrameKindType; class: AccordionPanelFieldLayoutDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: AccordionPanelFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: AccordionFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: AccordionFieldComponentDefinitionOutline }
  | { kind: FieldLayoutConfigKindType; class: AccordionFieldLayoutConfigOutline }
  | { kind: FieldLayoutDefinitionKindType; class: AccordionFieldLayoutDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: AccordionFormComponentDefinitionOutline }
  | { kind: FieldComponentConfigKindType; class: AccordionPanelFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: AccordionPanelFieldComponentDefinitionOutline }
  | { kind: FieldLayoutConfigKindType; class: AccordionPanelFieldLayoutConfigOutline }
  | { kind: FieldLayoutDefinitionKindType; class: AccordionPanelFieldLayoutDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: AccordionPanelFormComponentDefinitionOutline };
