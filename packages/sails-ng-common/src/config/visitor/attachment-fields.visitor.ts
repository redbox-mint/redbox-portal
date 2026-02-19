import { FormConfigVisitor } from './base.model';
import { ILogger } from '../../logger.interface';
import { FormConfigOutline } from '../form-config.outline';
import { FileUploadFormComponentDefinitionOutline } from '../component/file-upload.outline';
import { GroupFieldComponentDefinitionOutline, GroupFormComponentDefinitionOutline } from '../component/group.outline';
import { TabFieldComponentDefinitionOutline, TabFormComponentDefinitionOutline } from '../component/tab.outline';
import { TabContentFieldComponentDefinitionOutline, TabContentFormComponentDefinitionOutline } from '../component/tab-content.outline';
import { RepeatableFieldComponentDefinitionOutline, RepeatableFormComponentDefinitionOutline } from '../component/repeatable.outline';
import {
    AccordionFieldComponentDefinitionOutline,
    AccordionFormComponentDefinitionOutline,
    AccordionPanelFieldComponentDefinitionOutline,
    AccordionPanelFormComponentDefinitionOutline
} from '../component/accordion.outline';

/**
 * A visitor that traverses the form config and populates the attachmentFields property.
 * It identifies all FileUpload components and adds their names to the list.
 */
export class AttachmentFieldsVisitor extends FormConfigVisitor {
    protected override logName = 'AttachmentFieldsVisitor';
    private attachmentFields: string[] = [];

    constructor(logger: ILogger) {
        super(logger);
    }

    protected override notImplemented(): void {
        // Do nothing for components that we don't handle (leaf nodes that aren't FileUpload)
    }

    start(formConfig: FormConfigOutline): void {
        this.attachmentFields = [];
        formConfig.accept(this);
    }

    visitFormConfig(item: FormConfigOutline): void {
        // Visit all components
        item.componentDefinitions.forEach(component => {
            component.accept(this);
        });

        // Populate the attachmentFields property
        item.attachmentFields = this.attachmentFields;
    }

    // -- File Upload --

    visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
        if (item.component?.config) {
            // It's a file upload component, so it's an attachment field.
            // Use the component name (which corresponds to the metadata field name).
            if (item.name) {
                this.attachmentFields.push(item.name);
            }
        }
    }

    // -- Containers --

    // Group
    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        item.component.accept(this);
    }

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        item.config?.componentDefinitions?.forEach(def => def.accept(this));
    }

    // Tab
    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        item.component.accept(this);
    }

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        item.config?.tabs?.forEach(tab => tab.accept(this));
    }

    // Accordion
    visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): void {
        item.component.accept(this);
    }

    visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): void {
        item.config?.panels?.forEach(panel => panel.accept(this));
    }

    // Accordion Panel
    visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): void {
        item.component.accept(this);
    }

    visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): void {
        item.config?.componentDefinitions?.forEach(def => def.accept(this));
    }

    // Tab Content
    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        item.component.accept(this);
    }

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        item.config?.componentDefinitions?.forEach(def => def.accept(this));
    }

    // Repeatable
    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        item.component.accept(this);
    }

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        // We need to check the element template for attachments
        if (item.config?.elementTemplate) {
            item.config.elementTemplate.accept(this);
        }
    }
}
