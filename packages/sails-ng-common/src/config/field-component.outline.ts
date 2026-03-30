import {
  BaseFieldComponentConfigFrame,
  BaseFieldComponentDefinitionFrame,
  BaseFieldComponentDefinitionOutline,
} from './base-field-component.outline';

export interface FieldComponentConfigFrame extends BaseFieldComponentConfigFrame {
  onItemSelect?: {
    /** Dot-path into selectedItem.raw (or selectedItem) to extract this field's value */
    rawPath: string;
    /**
     * Value to set when selection is cleared. Defaults to null.
     * Should be type-compatible with the target control (e.g. string for text inputs, null for optional fields).
     */
    clearValue?: unknown;
  };
}

export interface FieldComponentConfigOutline extends FieldComponentConfigFrame {}

export interface FieldComponentDefinitionFrame extends BaseFieldComponentDefinitionFrame {
  config?: FieldComponentConfigFrame;
}

export interface FieldComponentDefinitionOutline
  extends BaseFieldComponentDefinitionOutline, FieldComponentDefinitionFrame {
  config?: FieldComponentConfigOutline;
}
