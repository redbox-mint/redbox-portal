import { FormConfigVisitorOutline } from "../visitor/base.outline";
import { FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind } from "../shared.outline";
import { FieldComponentConfig, FieldComponentDefinition } from "../field-component.model";
import { FormComponentDefinition } from "../form-component.model";
import { AvailableFieldLayoutDefinitionOutlines } from "../dictionary.outline";
import {
  SuggestedValidationSummaryComponentName,
  SuggestedValidationSummaryFieldComponentConfigOutline,
  SuggestedValidationSummaryFieldComponentDefinitionOutline,
  SuggestedValidationSummaryFormComponentDefinitionOutline,
} from "./suggested-validation-summary.outline";

export class SuggestedValidationSummaryFieldComponentConfig extends FieldComponentConfig implements SuggestedValidationSummaryFieldComponentConfigOutline {
  enabledValidationGroups: string[] = [];
  includeTabLabel = false;
  showWhenValid = false;
  header = "@dmpt-form-suggested-validation-summary-header";

  constructor() {
    super();
  }
}

export class SuggestedValidationSummaryFieldComponentDefinition extends FieldComponentDefinition implements SuggestedValidationSummaryFieldComponentDefinitionOutline {
  class = SuggestedValidationSummaryComponentName;
  config?: SuggestedValidationSummaryFieldComponentConfigOutline;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitSuggestedValidationSummaryFieldComponentDefinition(this);
  }
}

export class SuggestedValidationSummaryFormComponentDefinition extends FormComponentDefinition implements SuggestedValidationSummaryFormComponentDefinitionOutline {
  component!: SuggestedValidationSummaryFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitSuggestedValidationSummaryFormComponentDefinition(this);
  }
}

export const SuggestedValidationSummaryMap = [
  { kind: FieldComponentConfigKind, def: SuggestedValidationSummaryFieldComponentConfig },
  {
    kind: FieldComponentDefinitionKind,
    def: SuggestedValidationSummaryFieldComponentDefinition,
    class: SuggestedValidationSummaryComponentName,
  },
  {
    kind: FormComponentDefinitionKind,
    def: SuggestedValidationSummaryFormComponentDefinition,
    class: SuggestedValidationSummaryComponentName,
  },
];

export const SuggestedValidationSummaryDefaults = {
  [FormComponentDefinitionKind]: {
    [SuggestedValidationSummaryComponentName]: {
      [FieldComponentDefinitionKind]: SuggestedValidationSummaryComponentName,
    },
  },
};
