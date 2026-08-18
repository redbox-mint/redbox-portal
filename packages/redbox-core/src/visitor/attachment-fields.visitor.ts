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

    override async visitFormConfig(item: FormConfigOutline): Promise<void> {
        // Visit all components
        for (const component of item.componentDefinitions) {
            await component.accept(this);
        }
        // Populate the attachmentFields property
        item.attachmentFields = this.attachmentFields;
    }

    // -- File Upload --

    override async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
        if (item.component?.config) {
            // It's a file upload component, so it's an attachment field.
            // Use the component name (which corresponds to the metadata field name).
            if (item.name) {
                this.attachmentFields.push(item.name);
            }
        }
    }

    override async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
        if (item.component?.config && item.name) {
            this.attachmentFields.push(item.name);
        }
    }

    // -- Containers --

    // Group
    override async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    override async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
        for (const def of item.config?.componentDefinitions ?? []) {
            await def.accept(this);
        }
    }

    // Tab
    override async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    override async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
        for (const tab of item.config?.tabs ?? []) {
            await tab.accept(this);
        }
    }

    // Accordion
    override async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    override async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
        for (const panel of item.config?.panels ?? []) {
            await panel.accept(this);
        }
    }

    // Accordion Panel
    override async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    override async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> {
        for (const def of item.config?.componentDefinitions ?? []) {
            await def.accept(this);
        }
    }

    // Tab Content
    override async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    override async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
        for (const def of item.config?.componentDefinitions ?? []) {
            await def.accept(this);
        }
    }

    // Repeatable
    override async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
        await item.component.accept(this);
    }

    override async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
        // We need to check the element template for attachments
        if (item.config?.elementTemplate) {
            await item.config.elementTemplate.accept(this);
        }
    }
}
