import { HtmlRaw, Container, DateTime, AnchorOrButton, SaveButton, CancelButton, HiddenValue, LinkValue, TabOrAccordionContainer, ButtonBarContainer, SelectionField, ParameterRetrieverField, TabNavButton, Spacer, Toggle } from './form/field-simple';
import { TextField, TextFieldComponent, RepeatableTextfieldComponent, TextArea, TextAreaComponent, MarkdownTextArea, MarkdownTextAreaComponent} from './form/field-textfield.component';
import {
  DropdownFieldComponent,
  TabOrAccordionContainerComponent,
  ButtonBarContainerComponent,
  TextBlockComponent,
  DateTimeComponent,
  AnchorOrButtonComponent,
  SaveButtonComponent,
  CancelButtonComponent,
  HiddenValueComponent,
  LinkValueComponent,
  SelectionFieldComponent,
  ParameterRetrieverComponent,
  TabNavButtonComponent,
  SpacerComponent,
  ToggleComponent,
  HtmlRawComponent
} from './form/field-simple.component';
import { RecordMetadataRetrieverField, RecordMetadataRetrieverComponent } from './form/record-meta.component';
import { VocabField, VocabFieldComponent } from './form/field-vocab.component';
import { RepeatableContainer, RepeatableVocab, RepeatableContributor, RepeatableVocabComponent, RepeatableContributorComponent } from './form/field-repeatable.component';
import { ContributorField, ContributorComponent } from './form/field-contributor.component';
import { WorkflowStepButton, WorkflowStepButtonComponent } from './form/workflow-button.component';
import { ActionButton, ActionButtonComponent } from './form/action-button.component';
import { RelatedObjectDataField, RelatedObjectDataComponent } from './form/field-relatedobjectdata.component';
import { RelatedObjectSelectorComponent, RelatedObjectSelectorField } from './form/field-relatedobjectselector.component';
import { DataLocationComponent, DataLocationField } from './form/field-datalocation.component';
import { PublishDataLocationSelectorComponent, PublishDataLocationSelectorField } from './form/field-publishdatalocationselector.component'
import { MapField, MapComponent } from './form/field-map.component';
import { GenericGroupComponent, RepeatableGroupComponent } from './form/field-group.component';
import { WorkspaceSelectorField } from './form/workspace-field.component';
import { WorkspaceSelectorComponent, WorkspaceSelectorFieldComponent } from './form/workspace-selector.component';
import { ANDSVocabField, ANDSVocabComponent } from './form/field-andsvocab.component'
import { PDFListField, PDFListComponent } from './form/field-pdflist.component';
import { AsynchField, AsynchComponent } from './form/field-asynch.component';

export const fieldClasses=  {
  'TextField': { 'meta': TextField, 'comp': TextFieldComponent },
  'TextArea': { 'meta': TextArea, 'comp': TextAreaComponent },
  'MarkdownTextArea': { 'meta': MarkdownTextArea, 'comp': MarkdownTextAreaComponent },
  'DateTime': { 'meta': DateTime, 'comp': DateTimeComponent },
  'Container': {'meta': Container, 'comp': [ TextBlockComponent, GenericGroupComponent ] },
  'TabOrAccordionContainer': {'meta': TabOrAccordionContainer, 'comp': TabOrAccordionContainerComponent },
  'ButtonBarContainer': {'meta': ButtonBarContainer, 'comp': ButtonBarContainerComponent },
  'AnchorOrButton': { 'meta': AnchorOrButton, 'comp': AnchorOrButtonComponent },
  'SaveButton': { 'meta': SaveButton, 'comp': SaveButtonComponent },
  'CancelButton': { 'meta': CancelButton, 'comp': CancelButtonComponent },
  'VocabField': {'meta': VocabField, 'comp': VocabFieldComponent, 'lookupService': 'vocabFieldLookupService'},
  'RepeatableContainer': {'meta': RepeatableContainer, 'comp': [RepeatableVocabComponent, RepeatableTextfieldComponent, RepeatableGroupComponent]},
  'RepeatableContributor': {'meta': RepeatableContributor, 'comp': RepeatableContributorComponent },
  'RepeatableVocab': {'meta': RepeatableVocab, 'comp': RepeatableVocabComponent },
  'ContributorField': {'meta': ContributorField, 'comp': ContributorComponent, 'lookupService': 'vocabFieldLookupService'},
  'HiddenValue': {'meta': HiddenValue, 'comp': HiddenValueComponent},
  'WorkflowStepButton': {'meta': WorkflowStepButton, 'comp': WorkflowStepButtonComponent},
  'ActionButton': {'meta': ActionButton, 'comp': ActionButtonComponent},
  'LinkValueComponent': {'meta': LinkValue, 'comp': LinkValueComponent },
  'SelectionField': {'meta': SelectionField, 'comp': [ SelectionFieldComponent, DropdownFieldComponent ]},
  'RelatedObjectDataField': {'meta': RelatedObjectDataField, 'comp': RelatedObjectDataComponent, 'lookupService': 'vocabFieldLookupService'},
  'MapField': {'meta': MapField, 'comp': MapComponent, 'lookupService': 'vocabFieldLookupService'},
  'ParameterRetriever':{ 'meta': ParameterRetrieverField, 'comp': ParameterRetrieverComponent},
  'RecordMetadataRetriever':{ 'meta': RecordMetadataRetrieverField, 'comp': RecordMetadataRetrieverComponent},
  'RelatedObjectSelector':{ 'meta': RelatedObjectSelectorField, 'comp': RelatedObjectSelectorComponent},
  'DataLocation':{ 'meta': DataLocationField, 'comp': DataLocationComponent},
  'WorkspaceSelectorField' : { 'meta': WorkspaceSelectorField, 'comp': [WorkspaceSelectorComponent, WorkspaceSelectorFieldComponent] },
  'PublishDataLocationSelector':{ 'meta': PublishDataLocationSelectorField, 'comp': PublishDataLocationSelectorComponent},
  'TabNavButton': {'meta': TabNavButton, 'comp': TabNavButtonComponent},
  'Spacer': {'meta': Spacer, 'comp': SpacerComponent},
  'ANDSVocab':{ 'meta': ANDSVocabField, 'comp': ANDSVocabComponent},
  'PDFList': { 'meta': PDFListField, 'comp': PDFListComponent},
  'AsynchField': {'meta': AsynchField, 'comp': AsynchComponent },
  'Toggle': {'meta': Toggle, 'comp': ToggleComponent},
  'HtmlRaw': {'meta': HtmlRaw, 'comp': HtmlRawComponent}
};
