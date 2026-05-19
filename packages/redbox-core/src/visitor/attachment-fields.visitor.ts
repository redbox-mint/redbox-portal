import { FormConfigVisitor } from '@researchdatabox/sails-ng-common';
import { ILogger } from '@researchdatabox/sails-ng-common';
import { FormConfigOutline } from '@researchdatabox/sails-ng-common';
import { FileUploadFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { DataLocationFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { GroupFieldComponentDefinitionOutline, GroupFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { TabFieldComponentDefinitionOutline, TabFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { TabContentFieldComponentDefinitionOutline, TabContentFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { RepeatableFieldComponentDefinitionOutline, RepeatableFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import {
    AccordionFieldComponentDefinitionOutline,
    AccordionFormComponentDefinitionOutline,
    AccordionPanelFieldComponentDefinitionOutline,
    AccordionPanelFormComponentDefinitionOutline
} from '@researchdatabox/sails-ng-common';

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

    protected override async notImplemented(): Promise<void> {
        // Do nothing for components that we don't handle (leaf nodes that aren't FileUpload)
    }

    async start(formConfig: FormConfigOutline): Promise<void> {
        this.attachmentFields = [];
        await formConfig.accept(this);
    }

    async visitFormConfig(item: FormConfigOutline): Promise<void> {
        // Visit all components
        for (const component of item.componentDefinitions) {
          await component.accept(this);
        }
        // Populate the attachmentFields property
        item.attachmentFields = this.attachmentFields;
    }

    // -- File Upload --

    async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
        if (item.component?.config) {
            // It's a file upload component, so it's an attachment field.
            // Use the component name (which corresponds to the metadata field name).
            if (item.name) {
                this.attachmentFields.push(item.name);
            }
        }
    }

    async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
        if (item.component?.config && item.name) {
            this.attachmentFields.push(item.name);
        }
    }

    // -- Containers --

    // Group
    async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
        item.config?.componentDefinitions?.forEach(def => def.accept(this));
    }

    // Tab
    async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
        item.config?.tabs?.forEach(tab => tab.accept(this));
    }

    // Accordion
    async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
        item.config?.panels?.forEach(panel => panel.accept(this));
    }

    // Accordion Panel
    async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> {
        item.config?.componentDefinitions?.forEach(def => def.accept(this));
    }

    // Tab Content
    async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
      for (const def of item.config?.componentDefinitions ?? []) {
        await def.accept(this)
      }
    }

    // Repeatable
    async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
        // We need to check the element template for attachments
        if (item.config?.elementTemplate) {
            await item.config.elementTemplate.accept(this);
        }
    }
}
