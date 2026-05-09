# Configurable Form Components

> Generated from `packages/sails-ng-common/src/config`. Do not edit component tables by hand.

## How To Read This Page

- This page documents the built-in configurable form components registered in core ReDBox.
- Top-level components can be used directly in form config `fields` arrays.
- Nested/internal components are helper structures used inside other component configs or migration flows.
- Shared properties apply to every component before any component-specific config is considered.

## Shared Form Component Properties

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| model | FieldModelDefinitionOutline<unknown> | No |  |  |
| component | FieldComponentDefinitionOutline | Yes |  |  |
| layout | FieldLayoutDefinitionOutline | No |  |  |
| expressions | FormExpressionsConfigOutline[] | No |  |  |
| constraints | FormConstraintConfigOutline | No |  |  |
| overrides | FormOverrideConfigOutline | No |  |  |
| name | string | Yes |  | top-level field name, applies to field and the component, etc. |
| module | string | No |  | For a custom form component definition, module defines where to find the definition. |

## Shared Component Config Properties

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| onItemSelect | {<br>    /** Dot-path into selectedItem.raw (or selectedItem) to extract this field's value */<br>    rawPath: string;<br>    /**<br>     * Value to set when selection is cleared. Defaults to null.<br>     * Should be type-compatible with the target control (e.g. string for text inputs, null for optional fields).<br>     */<br>    clearValue?: unknown;<br>  } | No |  |  |

## Shared Model Config Properties

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| disableFormBinding | boolean | No |  | TODO: What is this for? And rename to `bindingDisabled` or `disabledBinding`. |
| value | ValueType | No |  | The current value of this model.<br><br>The 'value' is only available after the form config has been processed,<br>and the default values or the existing record values have been populated. |
| defaultValue | ValueType | No |  | The default value for this model.<br><br>The server-side processing uses this as the default for the field.<br>Defaults from ancestor fields will be combined to form the default value for a new record. |
| newEntryValue | ValueType | No |  | The value to use when creating new entries in the repeatable.<br><br>Only available in a repeatable's elementTemplate in 'model.config.newEntryValue'.<br><br>The default value for a repeatable is specified in 'model.config.defaultValue'.<br>The value for a repeatable is in 'model.config.value'. |
| validators | FormValidatorConfig[] | No |  | The validators that are configured at the field level that look at only this model. |
| wrapperCssClasses | string | No |  | The optional css classes to be applied to the wrapper element. |
| editCssClasses | string | No |  | The optional css classes to be applied to the form dom node in edit mode. |
| disabled | boolean | No |  | Whether the form control should be disabled.<br><br>Disabled controls are excluded from the parent form's value. |

## Components

### AccordionComponent

- Availability: top-level
- Model: none
- Default layout: AccordionLayout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| panels | AccordionPanelFormComponentDefinitionOutline[] | Yes |  |  |
| startingOpenMode | AccordionStartingOpenModeOptionsType | No | 'all-open' |  |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'accordion',
  component: {
    class: 'AccordionComponent',
    config: {
      panels: [],
      startingOpenMode: 'all-open'
    },
  }
}
```

### CancelButtonComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| confirmationMessage | string | No |  | An optional confirmation message shown to the user before cancelling.<br>If not set, the cancel action proceeds without confirmation. |
| confirmationTitle | string | No |  | The title of the confirmation dialog. |
| cancelButtonMessage | string | No |  | The label for the cancel button in the confirmation dialog. |
| confirmButtonMessage | string | No |  | The label for the confirm button in the confirmation dialog. |
| buttonCssClasses | string | No |  | CSS classes to apply to the main cancel button element.<br>Example: 'btn-warning' or 'btn btn-warning'. |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'cancel-button',
  component: {
    class: 'CancelButtonComponent',
    config: {
      confirmationMessage: 'example',
      confirmationTitle: 'example'
    },
  }
}
```

### CheckboxInputComponent

- Availability: top-level
- Model: CheckboxInputModel
- Value type: CheckboxInputModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| placeholder | string | No |  |  |
| options | CheckboxOption[] | No | [] |  |
| multipleValues | boolean | No |  |  |
| vocabRef | string | No |  |  |
| inlineVocab | boolean | No |  |  |
| historicalVocabMode | HistoricalVocabMode | No |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'checkbox-input',
  component: {
    class: 'CheckboxInputComponent',
    config: {
      placeholder: 'example',
      options: []
    },
  },
  model: {
    class: 'CheckboxInputModel',
  }
}
```

### CheckboxTreeComponent

- Availability: top-level
- Model: CheckboxTreeModel
- Value type: CheckboxTreeModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| vocabRef | string | No |  |  |
| inlineVocab | boolean | No |  |  |
| historicalVocabMode | HistoricalVocabMode | No |  |  |
| treeData | CheckboxTreeNode[] | No | [] |  |
| leafOnly | boolean | No |  |  |
| maxDepth | number | No |  |  |
| labelTemplate | string | No |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'checkbox-tree',
  component: {
    class: 'CheckboxTreeComponent',
    config: {
      vocabRef: 'example',
      inlineVocab: false
    },
  },
  model: {
    class: 'CheckboxTreeModel',
  }
}
```

### ContentComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| template | string | No |  | The template that can be used for setting content in innerHtml. |
| content | unknown | No |  | The value available to the template as `content`.<br>Set 'content' to static content, with no template, to just show the static content. |
| outputFormat | string | No |  | Optional auxiliary template context used by view-mode transforms. |
| contentIsTranslationCode | boolean | No |  | Whether the `content` value should be treated as a translation key. |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'content',
  component: {
    class: 'ContentComponent',
    config: {
      template: 'example',
      outputFormat: 'example'
    },
  }
}
```

### DataLocationComponent

- Availability: top-level
- Model: DataLocationModel
- Value type: DataLocationModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| notesEnabled | boolean | No | true |  |
| iscEnabled | boolean | No | false |  |
| iscHeader | string | No | "Information Security Classification" |  |
| defaultSelect | string | No | "confidential" |  |
| securityClassificationOptions | DataLocationOption[] | No | [] |  |
| locationAddText | string | No | "" |  |
| typeHeader | string | No | "Type" |  |
| locationHeader | string | No | "Location" |  |
| notesHeader | string | No | "Notes" |  |
| columns | string[] \| Record<string, unknown>[] | No | [] |  |
| editNotesButtonText | string | No | "Edit" |  |
| editNotesTitle | string | No | "Edit Notes" |  |
| cancelEditNotesButtonText | string | No | "Cancel" |  |
| applyEditNotesButtonText | string | No | "Apply" |  |
| editNotesCssClasses | string | No | "form-control" |  |
| dataTypes | DataLocationOption[] | No | [<br>        { label: "URL", value: "url" },<br>        { label: "Physical location", value: "physical" },<br>        { label: "File path", value: "file" },<br>        { label: "Attachment", value: "attachment" }<br>    ] |  |
| dataTypePlaceholder | string | No | "" |  |
| dataTypeLookup | Record<string, string> | No | {<br>        url: "URL",<br>        physical: "Physical location",<br>        file: "File path",<br>        attachment: "Attachment"<br>    } |  |
| hideNotesForLocationTypes | string[] | No | [] |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'data-location',
  component: {
    class: 'DataLocationComponent',
    config: {
      notesEnabled: true,
      iscEnabled: false
    },
  },
  model: {
    class: 'DataLocationModel',
  }
}
```

### DateInputComponent

- Availability: top-level
- Model: DateInputModel
- Value type: DateInputModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| placeholder | string | No | 'yyyy/mm/dd' |  |
| dateFormat | string | No | 'YYYY/MM/DD' |  |
| showWeekNumbers | boolean | No | false |  |
| containerClass | string | No | 'theme-dark-blue' |  |
| enableTimePicker | boolean | No | false |  |
| bsFullConfig | any | No | null |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'date-input',
  component: {
    class: 'DateInputComponent',
    config: {
      placeholder: 'yyyy/mm/dd',
      dateFormat: 'YYYY/MM/DD'
    },
  },
  model: {
    class: 'DateInputModel',
  }
}
```

### DeleteButtonComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| buttonCssClasses | string | No |  |  |
| closeOnDelete | boolean | No |  |  |
| redirectLocation | string | No |  |  |
| redirectDelaySeconds | number | No |  |  |
| confirmationMessage | string | No |  |  |
| confirmationTitle | string | No |  |  |
| cancelButtonMessage | string | No |  |  |
| confirmButtonMessage | string | No |  |  |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'delete-button',
  component: {
    class: 'DeleteButtonComponent',
    config: {
      buttonCssClasses: 'example',
      closeOnDelete: false
    },
  }
}
```

### DropdownInputComponent

- Availability: top-level
- Model: DropdownInputModel
- Value type: DropdownInputModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| placeholder | string | No |  |  |
| options | DropdownOption[] | No | [] |  |
| vocabRef | string | No |  |  |
| inlineVocab | boolean | No |  |  |
| historicalVocabMode | HistoricalVocabMode | No |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'dropdown-input',
  component: {
    class: 'DropdownInputComponent',
    config: {
      placeholder: 'example',
      options: []
    },
  },
  model: {
    class: 'DropdownInputModel',
  }
}
```

### FileUploadComponent

- Availability: top-level
- Model: FileUploadModel
- Value type: FileUploadModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| restrictions | Record<string, unknown> | No |  |  |
| enabledSources | FileUploadSourceType[] | No | [] |  |
| companionUrl | string | No |  |  |
| allowUploadWithoutSave | boolean | No | false |  |
| uppyDashboardNote | string | No | "Maximum upload size: 1 Gb per file" |  |
| tusHeaders | Record<string, string> | No |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'file-upload',
  component: {
    class: 'FileUploadComponent',
    config: {
      restrictions: {},
      enabledSources: []
    },
  },
  model: {
    class: 'FileUploadModel',
  }
}
```

### GroupComponent

- Availability: top-level
- Model: GroupModel
- Value type: GroupFieldModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| componentDefinitions | AvailableFormComponentDefinitionOutlines[] | Yes |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'group',
  component: {
    class: 'GroupComponent',
    config: {
      componentDefinitions: [
        {
          name: 'nested-item',
          component: {
            class: 'SimpleInputComponent'
          },
          model: {
            class: 'SimpleInputModel'
          }
        }
      ]
    },
  },
  model: {
    class: 'GroupModel',
  }
}
```

### MapComponent

- Availability: top-level
- Model: MapModel
- Value type: MapFeatureCollection
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| center | [number, number] | No | [-24.67, 134.07] |  |
| zoom | number | No | 4 |  |
| mapHeight | string | No | "450px" |  |
| tileLayers | MapTileLayerConfig[] | No | [] |  |
| enabledModes | MapDrawingMode[] | No | ["point", "polygon", "linestring", "rectangle", "select"] |  |
| enableImport | boolean | No | true |  |
| coordinatesHelp | string | No |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'map',
  component: {
    class: 'MapComponent',
    config: {
      center: '[-24.67, 134.07]',
      zoom: 4
    },
  },
  model: {
    class: 'MapModel',
  }
}
```

### PDFListComponent

- Availability: top-level
- Model: PDFListModel
- Value type: PDFListModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| startsWith | string | No | "rdmp-pdf" |  |
| recentPdfLimit | number | No | 5 |  |
| showVersionCounter | boolean | No | false |  |
| showVersionColumn | boolean | No | false |  |
| versionColumnValueField | string | No | "" |  |
| versionColumnLabelKey | string | No | "" |  |
| useVersionLabelForFileName | boolean | No | false |  |
| downloadBtnLabel | string | No | "@pdf-download" |  |
| downloadPreviousBtnLabel | string | No | "@pdf-download-previous" |  |
| downloadPrefix | string | No | "rdmp" |  |
| fileNameTemplate | string | No | "" |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'pdflist',
  component: {
    class: 'PDFListComponent',
    config: {
      startsWith: 'rdmp-pdf',
      recentPdfLimit: 5
    },
  },
  model: {
    class: 'PDFListModel',
  }
}
```

### PublishDataLocationRefreshComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

This component has no component-specific config properties beyond the shared component config.

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'publish-data-location-refresh',
  component: {
    class: 'PublishDataLocationRefreshComponent',
  }
}
```

### PublishDataLocationSelectorComponent

- Availability: top-level
- Model: PublishDataLocationSelectorModel
- Value type: PublishDataLocationModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| columns | string[] \| Record<string, unknown>[] | No | [] |  |
| editNotesButtonText | string | No | "Edit" |  |
| editNotesTitle | string | No | "Edit Notes" |  |
| cancelEditNotesButtonText | string | No | "Cancel" |  |
| applyEditNotesButtonText | string | No | "Apply" |  |
| editNotesCssClasses | string | No | "form-control" |  |
| typeHeader | string | No | "Type" |  |
| locationHeader | string | No | "Location" |  |
| notesHeader | string | No | "Notes" |  |
| iscHeader | string | No | "Information Security Classification" |  |
| iscEnabled | boolean | No | false |  |
| notesEnabled | boolean | No | true |  |
| noLocationSelectedText | string | No | "Publish Metadata Only" |  |
| noLocationSelectedHelp | string | No | "Publicise only metadata (or description)" |  |
| publicCheck | string | No | "public" |  |
| selectionCriteria | PublishDataLocationSelectionCriterion[] | No | [{ isc: "public", type: "attachment" }] |  |
| dataTypes | DataLocationOption[] | No | [<br>    { label: "URL", value: "url" },<br>    { label: "Physical location", value: "physical" },<br>    { label: "File path", value: "file" },<br>    { label: "Attachment", value: "attachment" },<br>  ] |  |
| dataTypeLookup | Record<string, string> | No | {<br>    url: "URL",<br>    physical: "Physical location",<br>    file: "File path",<br>    attachment: "Attachment",<br>  } |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'publish-data-location-selector',
  component: {
    class: 'PublishDataLocationSelectorComponent',
    config: {
      columns: [],
      editNotesButtonText: 'Edit'
    },
  },
  model: {
    class: 'PublishDataLocationSelectorModel',
  }
}
```

### QuestionTreeComponent

- Availability: top-level
- Model: QuestionTreeModel
- Value type: QuestionTreeModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| availableOutcomes | QuestionTreeOutcome[] | Yes |  |  |
| availableMeta | QuestionTreeMeta | No |  |  |
| questions | QuestionTreeQuestion[] | Yes |  |  |
| componentDefinitions | AvailableFormComponentDefinitionOutlines[] | Yes |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'question-tree',
  component: {
    class: 'QuestionTreeComponent',
    config: {
      availableOutcomes: [],
      questions: [],
      componentDefinitions: [
        {
          name: 'nested-item',
          component: {
            class: 'SimpleInputComponent'
          },
          model: {
            class: 'SimpleInputModel'
          }
        }
      ]
    },
  },
  model: {
    class: 'QuestionTreeModel',
  }
}
```

### RadioInputComponent

- Availability: top-level
- Model: RadioInputModel
- Value type: RadioInputModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| options | RadioOption[] | No | [] |  |
| vocabRef | string | No |  |  |
| inlineVocab | boolean | No |  |  |
| historicalVocabMode | HistoricalVocabMode | No |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'radio-input',
  component: {
    class: 'RadioInputComponent',
    config: {
      options: [],
      vocabRef: 'example'
    },
  },
  model: {
    class: 'RadioInputModel',
  }
}
```

### RecordMetadataRetrieverComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

This component has no component-specific config properties beyond the shared component config.

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'record-metadata-retriever',
  component: {
    class: 'RecordMetadataRetrieverComponent',
  }
}
```

### RecordSelectorComponent

- Availability: top-level
- Model: RecordSelectorModel
- Value type: RecordSelectorModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| columnTitle | string | No | 'Record title' |  |
| recordType | string | No |  |  |
| workflowState | string | No | '' |  |
| filterMode | string | No | 'default' |  |
| filterFields | string[] | No | [] |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'record-selector',
  component: {
    class: 'RecordSelectorComponent',
    config: {
      columnTitle: 'Record title',
      recordType: 'example'
    },
  },
  model: {
    class: 'RecordSelectorModel',
  }
}
```

### RepeatableComponent

- Availability: top-level
- Model: RepeatableModel
- Value type: RepeatableModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| elementTemplate | AvailableFormComponentDefinitionOutlines | Yes |  |  |
| addButtonShow | boolean | No | true |  |
| allowZeroRows | boolean | No | false |  |
| hideWhenZeroRows | boolean | No | false |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'repeatable',
  component: {
    class: 'RepeatableComponent',
    config: {
      elementTemplate: {
        name: 'nested-item',
        component: {
          class: 'SimpleInputComponent'
        },
        model: {
          class: 'SimpleInputModel'
        }
      },
      addButtonShow: true
    },
  },
  model: {
    class: 'RepeatableModel',
  }
}
```

### RichTextEditorComponent

- Availability: top-level
- Model: RichTextEditorModel
- Value type: string
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| outputFormat | RichTextEditorOutputFormatType | No | "html" |  |
| showSourceToggle | boolean | No | false |  |
| toolbar | string[] | No | [...defaultToolbar] |  |
| minHeight | string | No | "200px" |  |
| placeholder | string | No | "" |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'rich-text-editor',
  component: {
    class: 'RichTextEditorComponent',
    config: {
      outputFormat: 'html',
      showSourceToggle: false
    },
  },
  model: {
    class: 'RichTextEditorModel',
    config: {
      defaultValue: ''
    },
  }
}
```

### SaveButtonComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| targetStep | string | No |  | Try to transition to this workflow step as part of the save process on the server. |
| forceSave | boolean | No |  | Save the form, even if it would otherwise not be able to save.<br>For example, save even if nothing has changed or there are validation failures. |
| labelSaving | string | No |  | The label to set to the button while saving. |
| buttonCssClasses | string | No |  | CSS classes to apply to the underlying button element.<br>Example: 'btn-success' or 'btn btn-success'. |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'save-button',
  component: {
    class: 'SaveButtonComponent',
    config: {
      targetStep: 'example',
      forceSave: false
    },
  }
}
```

### SaveStatusComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| successDisplayDurationMs | number | No | 3000 | How long to keep the success message visible after a save succeeds.<br>Defaults to 3000 milliseconds. |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'save-status',
  component: {
    class: 'SaveStatusComponent',
    config: {
      successDisplayDurationMs: 3000
    },
  }
}
```

### SimpleInputComponent

- Availability: top-level
- Model: SimpleInputModel
- Value type: string
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| placeholder | string | No | '' |  |
| type | SimpleInputFieldComponentConfigType | No | "text" |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'simple-input',
  component: {
    class: 'SimpleInputComponent',
    config: {
      placeholder: '',
      type: 'text'
    },
  },
  model: {
    class: 'SimpleInputModel',
    config: {
      defaultValue: ''
    },
  }
}
```

### SuggestedValidationSummaryComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| enabledValidationGroups | string[] | No | [] |  |
| includeTabLabel | boolean | No | false |  |
| showWhenValid | boolean | No | false |  |
| header | string | No | "@dmpt-form-suggested-validation-summary-header" |  |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'suggested-validation-summary',
  component: {
    class: 'SuggestedValidationSummaryComponent',
    config: {
      enabledValidationGroups: [],
      includeTabLabel: false
    },
  }
}
```

### TabComponent

- Availability: top-level
- Model: none
- Default layout: TabLayout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| tabs | TabContentFormComponentDefinitionOutline[] | Yes |  |  |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'tab',
  component: {
    class: 'TabComponent',
    config: {
      tabs: []
    },
  }
}
```

### TabNavButtonComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| prevLabel | string | No |  | The label for the previous button. |
| nextLabel | string | No |  | The label for the next button. |
| targetTabContainerId | string | No |  | The name of the target TabComponent to navigate. |
| endDisplayMode | string | No |  | How to handle the button at the start/end of tabs.<br>'hidden' hides the button, 'disabled' disables it. |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'tab-nav-button',
  component: {
    class: 'TabNavButtonComponent',
    config: {
      prevLabel: 'example',
      nextLabel: 'example'
    },
  }
}
```

### TextAreaComponent

- Availability: top-level
- Model: TextAreaModel
- Value type: string
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| rows | number | Yes | 2 |  |
| cols | number | Yes | 20 |  |
| placeholder | string | No | '' |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'text-area',
  component: {
    class: 'TextAreaComponent',
    config: {
      rows: 2,
      cols: 20,
      placeholder: ''
    },
  },
  model: {
    class: 'TextAreaModel',
    config: {
      defaultValue: ''
    },
  }
}
```

### TypeaheadInputComponent

- Availability: top-level
- Model: TypeaheadInputModel
- Value type: TypeaheadInputModelValueType
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| sourceType | TypeaheadSourceType | No | "static" |  |
| staticOptions | TypeaheadOption[] | No | [] |  |
| vocabRef | string | No |  |  |
| queryId | string | No |  |  |
| provider | string | No |  |  |
| resultArrayProperty | string | No |  |  |
| labelField | string | No |  |  |
| labelTemplate | string | No |  |  |
| valueField | string | No |  |  |
| minChars | number | No | 2 |  |
| debounceMs | number | No | 250 |  |
| maxResults | number | No | 25 |  |
| requireSelection | boolean | No | false |  |
| valueMode | TypeaheadValueMode | No | "value" |  |
| cacheResults | boolean | No | true |  |
| multiSelect | boolean | No | false |  |
| placeholder | string | No |  |  |
| readOnlyAfterSelect | boolean | No |  |  |
| historicalVocabMode | HistoricalVocabMode | No |  |  |

#### Model Config

This component has no model-specific config properties beyond the shared model config.

#### Example

```ts
{
  name: 'typeahead-input',
  component: {
    class: 'TypeaheadInputComponent',
    config: {
      sourceType: 'static',
      staticOptions: []
    },
  },
  model: {
    class: 'TypeaheadInputModel',
  }
}
```

### ValidationSummaryComponent

- Availability: top-level
- Model: none
- Default layout: any available field layout

#### Component Config

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| includeTabLabel | boolean | No |  | Whether to include tab labels in validation summary labels.<br>Group labels are always included. |
| showWhenValid | boolean | No | false | Whether to render the informational success message when the form has no validation errors.<br>Defaults to false. |

#### Model Config

This component does not define a model.

#### Example

```ts
{
  name: 'validation-summary',
  component: {
    class: 'ValidationSummaryComponent',
    config: {
      includeTabLabel: false,
      showWhenValid: false
    },
  }
}
```
