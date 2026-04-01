import { FieldModelConfig, FieldModelDefinition } from "../field-model.model";
import { FormComponentDefinition } from "../form-component.model";
import { FormConfigVisitorOutline } from "../visitor/base.outline";
import {
  FieldComponentConfigKind,
  FieldComponentDefinitionKind,
  FieldModelConfigKind,
  FieldModelDefinitionKind,
  FormComponentDefinitionKind,
} from "../shared.outline";
import { FieldComponentConfig, FieldComponentDefinition } from "../field-component.model";
import { AvailableFieldLayoutDefinitionOutlines } from "../dictionary.outline";
import {
  PublishDataLocationModelValueType,
  PublishDataLocationSelectorComponentName,
  PublishDataLocationSelectorFieldComponentConfigOutline,
  PublishDataLocationSelectorFieldComponentDefinitionOutline,
  PublishDataLocationSelectorFieldModelConfigOutline,
  PublishDataLocationSelectorFieldModelDefinitionOutline,
  PublishDataLocationSelectorFormComponentDefinitionOutline,
  PublishDataLocationSelectorModelName,
} from "./publish-data-location-selector.outline";
import { DataLocationOption } from "./data-location.outline";

export class PublishDataLocationSelectorFieldComponentConfig
  extends FieldComponentConfig
  implements PublishDataLocationSelectorFieldComponentConfigOutline
{
  columns: string[] | Record<string, unknown>[] = [];
  editNotesButtonText = "Edit";
  editNotesTitle = "Edit Notes";
  cancelEditNotesButtonText = "Cancel";
  applyEditNotesButtonText = "Apply";
  editNotesCssClasses = "form-control";
  typeHeader = "Type";
  locationHeader = "Location";
  notesHeader = "Notes";
  iscHeader = "Information Security Classification";
  iscEnabled = false;
  notesEnabled = true;
  noLocationSelectedText = "Publish Metadata Only";
  noLocationSelectedHelp = "Publicise only metadata (or description)";
  publicCheck = "public";
  selectionCriteria: Record<string, string>[] = [{ isc: "public", type: "attachment" }];
  dataTypes: DataLocationOption[] = [
    { label: "URL", value: "url" },
    { label: "Physical location", value: "physical" },
    { label: "File path", value: "file" },
    { label: "Attachment", value: "attachment" },
  ];
  dataTypeLookup: Record<string, string> = {
    url: "URL",
    physical: "Physical location",
    file: "File path",
    attachment: "Attachment",
  };
}

export class PublishDataLocationSelectorFieldComponentDefinition
  extends FieldComponentDefinition
  implements PublishDataLocationSelectorFieldComponentDefinitionOutline
{
  class = PublishDataLocationSelectorComponentName;
  config?: PublishDataLocationSelectorFieldComponentConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitPublishDataLocationSelectorFieldComponentDefinition(this);
  }
}

export class PublishDataLocationSelectorFieldModelConfig
  extends FieldModelConfig<PublishDataLocationModelValueType>
  implements PublishDataLocationSelectorFieldModelConfigOutline
{
  defaultValue: PublishDataLocationModelValueType;

  constructor() {
    super();
    this.defaultValue = [];
  }
}

export class PublishDataLocationSelectorFieldModelDefinition
  extends FieldModelDefinition<PublishDataLocationModelValueType>
  implements PublishDataLocationSelectorFieldModelDefinitionOutline
{
  class = PublishDataLocationSelectorModelName;
  config?: PublishDataLocationSelectorFieldModelConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitPublishDataLocationSelectorFieldModelDefinition(this);
  }
}

export class PublishDataLocationSelectorFormComponentDefinition
  extends FormComponentDefinition
  implements PublishDataLocationSelectorFormComponentDefinitionOutline
{
  public component!: PublishDataLocationSelectorFieldComponentDefinitionOutline;
  public model?: PublishDataLocationSelectorFieldModelDefinitionOutline;
  public layout?: AvailableFieldLayoutDefinitionOutlines;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitPublishDataLocationSelectorFormComponentDefinition(this);
  }
}

export const PublishDataLocationSelectorMap = [
  { kind: FieldComponentConfigKind, def: PublishDataLocationSelectorFieldComponentConfig },
  {
    kind: FieldComponentDefinitionKind,
    def: PublishDataLocationSelectorFieldComponentDefinition,
    class: PublishDataLocationSelectorComponentName,
  },
  { kind: FieldModelConfigKind, def: PublishDataLocationSelectorFieldModelConfig },
  {
    kind: FieldModelDefinitionKind,
    def: PublishDataLocationSelectorFieldModelDefinition,
    class: PublishDataLocationSelectorModelName,
  },
  {
    kind: FormComponentDefinitionKind,
    def: PublishDataLocationSelectorFormComponentDefinition,
    class: PublishDataLocationSelectorComponentName,
  },
] as const;

export const PublishDataLocationSelectorDefaults = {
  [FormComponentDefinitionKind]: {
    [PublishDataLocationSelectorComponentName]: {
      [FieldComponentDefinitionKind]: PublishDataLocationSelectorComponentName,
      [FieldModelDefinitionKind]: PublishDataLocationSelectorModelName,
    },
  },
};
