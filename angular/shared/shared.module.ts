import { NgModule }      from '@angular/core';
import { MarkdownModule } from 'angular2-markdown';
import { ReactiveFormsModule, FormsModule } from "@angular/forms";
import { BrowserModule } from '@angular/platform-browser';
import { RecordsService } from './form/records.service';
import { FieldControlService } from './form/field-control.service';
import { TextFieldComponent, RepeatableTextfieldComponent } from './form/field-textfield.component';
import { DropdownFieldComponent, TabOrAccordionContainerComponent, ButtonBarContainerComponent, TextBlockComponent, MarkdownTextAreaComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, SaveButtonComponent, CancelButtonComponent, HtmlRawComponent, HiddenValueComponent, LinkValueComponent, SelectionFieldComponent, ParameterRetrieverComponent, TabNavButtonComponent, SpacerComponent } from './form/field-simple.component';
import { RecordMetadataRetrieverComponent } from './form/record-meta.component';
import { VocabField, VocabFieldComponent, VocabFieldLookupService } from './form/field-vocab.component';
import { RepeatableVocabComponent, RepeatableContributorComponent } from './form/field-repeatable.component';
import { ContributorComponent } from './form/field-contributor.component';
import { RelatedObjectDataComponent } from './form/field-relatedobjectdata.component';
import { RelatedObjectSelectorComponent } from './form/field-relatedobjectselector.component';
import { DataLocationComponent } from './form/field-datalocation.component';
import { PublishDataLocationSelectorComponent } from './form/field-publishdatalocationselector.component';
import { MapComponent } from './form/field-map.component';
import { WorkflowStepButtonComponent } from './form/workflow-button.component';
import { ConfigService } from './config-service';
import { TranslationService } from './translation-service';
import { NKDatetimeModule } from 'ng2-datetime/ng2-datetime';
import { Ng2CompleterModule } from "ng2-completer";
import { TranslateI18NextModule } from 'ngx-i18next';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { LeafletDrawModule } from '@asymmetrik/ngx-leaflet-draw';
import { DmpFieldComponent } from './form/dmp-field.component';
import { UserSimpleService } from './user.service-simple';
import { DashboardService } from './dashboard-service';
import { StringTemplatePipe }  from './StringTemplatePipe';
import { RolesService } from './roles-service';
import { UtilityService } from './util-service';
import { EmailNotificationService } from './email-service';
import { GenericGroupComponent, RepeatableGroupComponent } from './form/field-group.component';
import { WorkspaceSelectorFieldComponent } from './form/workspace-selector.component';
import { WorkspaceTypeService } from './workspace-service';
import { WorkspaceFieldComponent } from './form/workspace-field.component';
import { WorkspaceSelectorComponent } from './form/workspace-selector.component';
import { FieldControlMetaService } from './form/field-control-meta.service';

@NgModule({
  imports:      [ BrowserModule, FormsModule, ReactiveFormsModule, NKDatetimeModule, Ng2CompleterModule, TranslateI18NextModule, LeafletModule.forRoot(), LeafletDrawModule.forRoot(), MarkdownModule.forRoot() ],
  exports:      [ NKDatetimeModule, Ng2CompleterModule, TranslateI18NextModule, DmpFieldComponent, TextFieldComponent, DropdownFieldComponent, TabOrAccordionContainerComponent, ButtonBarContainerComponent, TextBlockComponent,MarkdownTextAreaComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, VocabFieldComponent, RepeatableVocabComponent, ContributorComponent, RepeatableContributorComponent, HtmlRawComponent, HiddenValueComponent, WorkflowStepButtonComponent, LinkValueComponent, SelectionFieldComponent, RepeatableTextfieldComponent, StringTemplatePipe, GenericGroupComponent, RepeatableGroupComponent, MapComponent, ParameterRetrieverComponent, RecordMetadataRetrieverComponent, RelatedObjectSelectorComponent, DataLocationComponent, PublishDataLocationSelectorComponent, WorkspaceSelectorFieldComponent, TabNavButtonComponent, SpacerComponent, WorkspaceFieldComponent, WorkspaceSelectorComponent],
  declarations: [ DmpFieldComponent, TextFieldComponent, DropdownFieldComponent, TabOrAccordionContainerComponent, ButtonBarContainerComponent, TextBlockComponent, MarkdownTextAreaComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, SaveButtonComponent, CancelButtonComponent, VocabFieldComponent, RepeatableVocabComponent, ContributorComponent, RepeatableContributorComponent, HtmlRawComponent, HiddenValueComponent, WorkflowStepButtonComponent, LinkValueComponent, SelectionFieldComponent, RepeatableTextfieldComponent, RelatedObjectDataComponent, StringTemplatePipe, GenericGroupComponent, RepeatableGroupComponent, MapComponent, ParameterRetrieverComponent, RecordMetadataRetrieverComponent, RelatedObjectSelectorComponent, DataLocationComponent, PublishDataLocationSelectorComponent, WorkspaceSelectorFieldComponent, TabNavButtonComponent, SpacerComponent, WorkspaceFieldComponent, WorkspaceSelectorComponent ],
  providers:    [ FieldControlService, RecordsService, VocabFieldLookupService, ConfigService, TranslationService, UserSimpleService, DashboardService, RolesService, EmailNotificationService, UtilityService, WorkspaceTypeService, FieldControlMetaService ],
  bootstrap:    [ ],
  entryComponents: [ DmpFieldComponent, TextFieldComponent, DropdownFieldComponent, TabOrAccordionContainerComponent, ButtonBarContainerComponent, TextBlockComponent, MarkdownTextAreaComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, SaveButtonComponent, CancelButtonComponent, VocabFieldComponent, RepeatableVocabComponent, ContributorComponent, RepeatableContributorComponent, HtmlRawComponent, HiddenValueComponent, WorkflowStepButtonComponent, LinkValueComponent, SelectionFieldComponent, RepeatableTextfieldComponent, RelatedObjectDataComponent, GenericGroupComponent, RepeatableGroupComponent, MapComponent, ParameterRetrieverComponent, RecordMetadataRetrieverComponent, RelatedObjectSelectorComponent,DataLocationComponent, PublishDataLocationSelectorComponent, WorkspaceSelectorFieldComponent, TabNavButtonComponent, SpacerComponent, WorkspaceFieldComponent, WorkspaceSelectorComponent ]
})
export class SharedModule { }
