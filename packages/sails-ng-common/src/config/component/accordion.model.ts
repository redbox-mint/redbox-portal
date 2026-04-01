import {
  FieldComponentConfigKind,
  FieldComponentDefinitionKind,
  FieldLayoutConfigKind,
  FieldLayoutDefinitionKind,
  FormComponentDefinitionKind,
} from '../shared.outline';
import { FormComponentDefinition } from '../form-component.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { FieldLayoutConfig, FieldLayoutDefinition } from '../field-layout.model';
import {
  AccordionComponentName,
  AccordionFieldComponentConfigOutline,
  AccordionFieldComponentDefinitionOutline,
  AccordionFieldLayoutConfigOutline,
  AccordionFieldLayoutDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionLayoutName,
  AccordionPanelComponentName,
  AccordionPanelFieldComponentConfigOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFieldLayoutConfigOutline,
  AccordionPanelFieldLayoutDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  AccordionStartingOpenModeOptionsType,
  AccordionPanelLayoutName,
} from './accordion.outline';

/* Accordion Component */

export class AccordionFieldComponentConfig extends FieldComponentConfig implements AccordionFieldComponentConfigOutline {
  panels: AccordionPanelFormComponentDefinitionOutline[];
  startingOpenMode: AccordionStartingOpenModeOptionsType = 'all-open';
  hostCssClasses = 'view-accordion';

  constructor() {
    super();
    this.panels = [];
  }
}

export class AccordionFieldComponentDefinition extends FieldComponentDefinition implements AccordionFieldComponentDefinitionOutline {
  class = AccordionComponentName;
  config?: AccordionFieldComponentConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitAccordionFieldComponentDefinition(this);
  }
}

/* Accordion Panel Component */

export class AccordionPanelFieldComponentConfig
  extends FieldComponentConfig
  implements AccordionPanelFieldComponentConfigOutline
{
  componentDefinitions: AccordionPanelFieldComponentConfigOutline['componentDefinitions'];

  constructor() {
    super();
    this.componentDefinitions = [];
  }
}

export class AccordionPanelFieldComponentDefinition
  extends FieldComponentDefinition
  implements AccordionPanelFieldComponentDefinitionOutline
{
  class = AccordionPanelComponentName;
  config?: AccordionPanelFieldComponentConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitAccordionPanelFieldComponentDefinition(this);
  }
}

/* Accordion Layout */

export class AccordionFieldLayoutConfig extends FieldLayoutConfig implements AccordionFieldLayoutConfigOutline {
  constructor() {
    super();
  }
}

export class AccordionFieldLayoutDefinition extends FieldLayoutDefinition implements AccordionFieldLayoutDefinitionOutline {
  class = AccordionLayoutName;
  config?: AccordionFieldLayoutConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitAccordionFieldLayoutDefinition(this);
  }
}

/* Accordion Panel Layout */

export class AccordionPanelFieldLayoutConfig
  extends FieldLayoutConfig
  implements AccordionPanelFieldLayoutConfigOutline
{
  buttonLabel?: string;

  constructor() {
    super();
  }
}

export class AccordionPanelFieldLayoutDefinition
  extends FieldLayoutDefinition
  implements AccordionPanelFieldLayoutDefinitionOutline
{
  class = AccordionPanelLayoutName;
  config?: AccordionPanelFieldLayoutConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitAccordionPanelFieldLayoutDefinition(this);
  }
}

/* Accordion Form Components */

export class AccordionFormComponentDefinition extends FormComponentDefinition implements AccordionFormComponentDefinitionOutline {
  public component!: AccordionFieldComponentDefinitionOutline;
  public model?: never;
  public layout?: AccordionFieldLayoutDefinitionOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitAccordionFormComponentDefinition(this);
  }
}

export class AccordionPanelFormComponentDefinition
  extends FormComponentDefinition
  implements AccordionPanelFormComponentDefinitionOutline
{
  public component!: AccordionPanelFieldComponentDefinitionOutline;
  public model?: never;
  public layout?: AccordionPanelFieldLayoutDefinitionOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitAccordionPanelFormComponentDefinition(this);
  }
}

export const AccordionMap = [
  { kind: FieldComponentConfigKind, def: AccordionFieldComponentConfig },
  { kind: FieldComponentDefinitionKind, def: AccordionFieldComponentDefinition, class: AccordionComponentName },
  { kind: FieldLayoutConfigKind, def: AccordionFieldLayoutConfig },
  { kind: FieldLayoutDefinitionKind, def: AccordionFieldLayoutDefinition, class: AccordionLayoutName },
  { kind: FormComponentDefinitionKind, def: AccordionFormComponentDefinition, class: AccordionComponentName },
  { kind: FieldComponentConfigKind, def: AccordionPanelFieldComponentConfig },
  {
    kind: FieldComponentDefinitionKind,
    def: AccordionPanelFieldComponentDefinition,
    class: AccordionPanelComponentName,
  },
  { kind: FieldLayoutConfigKind, def: AccordionPanelFieldLayoutConfig },
  { kind: FieldLayoutDefinitionKind, def: AccordionPanelFieldLayoutDefinition, class: AccordionPanelLayoutName },
  {
    kind: FormComponentDefinitionKind,
    def: AccordionPanelFormComponentDefinition,
    class: AccordionPanelComponentName,
  },
];

export const AccordionDefaults = {
  [FormComponentDefinitionKind]: {
    [AccordionComponentName]: {
      [FieldComponentDefinitionKind]: AccordionComponentName,
      [FieldLayoutDefinitionKind]: AccordionLayoutName,
    },
    [AccordionPanelComponentName]: {
      [FieldComponentDefinitionKind]: AccordionPanelComponentName,
      [FieldLayoutDefinitionKind]: AccordionPanelLayoutName,
    },
  },
};
