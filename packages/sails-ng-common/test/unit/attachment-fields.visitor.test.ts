
import { AttachmentFieldsVisitor } from "../../src/config/visitor/attachment-fields.visitor";
import { logger } from "./helpers";
import { FormConfig } from "../../src/config/form-config.model";
import { FileUploadFormComponentDefinition } from "../../src/config/component/file-upload.model";
import { FileUploadFieldComponentDefinition, FileUploadFieldComponentConfig } from "../../src/config/component/file-upload.model";
import { GroupFormComponentDefinition } from "../../src/config/component/group.model";
import { GroupFieldComponentDefinition, GroupFieldComponentConfig } from "../../src/config/component/group.model";
import { TabFormComponentDefinition } from "../../src/config/component/tab.model";
import { TabFieldComponentDefinition, TabFieldComponentConfig } from "../../src/config/component/tab.model";
import { TabContentFormComponentDefinition } from "../../src/config/component/tab-content.model";
import { TabContentFieldComponentDefinition, TabContentFieldComponentConfig } from "../../src/config/component/tab-content.model";
import { RepeatableFormComponentDefinition } from "../../src/config/component/repeatable.model";
import { RepeatableFieldComponentDefinition, RepeatableFieldComponentConfig } from "../../src/config/component/repeatable.model";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("AttachmentFieldsVisitor", () => {
    it("should identify top-level FileUpload component", () => {
        const formConfig = new FormConfig();
        const fileUpload = new FileUploadFormComponentDefinition();
        fileUpload.name = "fileUpload1";
        fileUpload.component = new FileUploadFieldComponentDefinition();
        fileUpload.component.config = new FileUploadFieldComponentConfig();
        formConfig.componentDefinitions = [fileUpload];

        const visitor = new AttachmentFieldsVisitor(logger);
        visitor.start(formConfig);

        expect(formConfig.attachmentFields).to.include("fileUpload1");
        expect(formConfig.attachmentFields?.length).to.equal(1);
    });

    it("should identify nested FileUpload component in Group", () => {
        const formConfig = new FormConfig();
        const group = new GroupFormComponentDefinition();
        group.name = "group1";
        group.component = new GroupFieldComponentDefinition();
        group.component.config = new GroupFieldComponentConfig();

        const fileUpload = new FileUploadFormComponentDefinition();
        fileUpload.name = "fileUploadInGroup";
        fileUpload.component = new FileUploadFieldComponentDefinition();
        fileUpload.component.config = new FileUploadFieldComponentConfig();

        group.component.config.componentDefinitions = [fileUpload];
        formConfig.componentDefinitions = [group];

        const visitor = new AttachmentFieldsVisitor(logger);
        visitor.start(formConfig);

        expect(formConfig.attachmentFields).to.include("fileUploadInGroup");
        expect(formConfig.attachmentFields?.length).to.equal(1);
    });

    it("should identify nested FileUpload component in Tab", () => {
        const formConfig = new FormConfig();
        const tab = new TabFormComponentDefinition();
        tab.name = "tab1";
        tab.component = new TabFieldComponentDefinition();
        tab.component.config = new TabFieldComponentConfig();

        const tabContent = new TabContentFormComponentDefinition();
        tabContent.name = "tabContent1";
        tabContent.component = new TabContentFieldComponentDefinition();
        tabContent.component.config = new TabContentFieldComponentConfig();

        const fileUpload = new FileUploadFormComponentDefinition();
        fileUpload.name = "fileUploadInTab";
        fileUpload.component = new FileUploadFieldComponentDefinition();
        fileUpload.component.config = new FileUploadFieldComponentConfig();

        tabContent.component.config.componentDefinitions = [fileUpload];
        tab.component.config.tabs = [tabContent];
        formConfig.componentDefinitions = [tab];

        const visitor = new AttachmentFieldsVisitor(logger);
        visitor.start(formConfig);

        expect(formConfig.attachmentFields).to.include("fileUploadInTab");
        expect(formConfig.attachmentFields?.length).to.equal(1);
    });

    it("should identify FileUpload component in Repeatable elementTemplate", () => {
        const formConfig = new FormConfig();
        const repeatable = new RepeatableFormComponentDefinition();
        repeatable.name = "repeatable1";
        repeatable.component = new RepeatableFieldComponentDefinition();
        repeatable.component.config = new RepeatableFieldComponentConfig();

        const fileUpload = new FileUploadFormComponentDefinition();
        fileUpload.name = "fileUploadInRepeatable";
        fileUpload.component = new FileUploadFieldComponentDefinition();
        fileUpload.component.config = new FileUploadFieldComponentConfig();

        repeatable.component.config.elementTemplate = fileUpload;
        formConfig.componentDefinitions = [repeatable];

        const visitor = new AttachmentFieldsVisitor(logger);
        visitor.start(formConfig);

        expect(formConfig.attachmentFields).to.include("fileUploadInRepeatable");
        expect(formConfig.attachmentFields?.length).to.equal(1);
    });

    it("should identify multiple FileUpload components", () => {
        const formConfig = new FormConfig();

        const fileUpload1 = new FileUploadFormComponentDefinition();
        fileUpload1.name = "fileUpload1";
        fileUpload1.component = new FileUploadFieldComponentDefinition();
        fileUpload1.component.config = new FileUploadFieldComponentConfig();

        const group = new GroupFormComponentDefinition();
        group.name = "group1";
        group.component = new GroupFieldComponentDefinition();
        group.component.config = new GroupFieldComponentConfig();

        const fileUpload2 = new FileUploadFormComponentDefinition();
        fileUpload2.name = "fileUpload2";
        fileUpload2.component = new FileUploadFieldComponentDefinition();
        fileUpload2.component.config = new FileUploadFieldComponentConfig();

        group.component.config.componentDefinitions = [fileUpload2];

        formConfig.componentDefinitions = [fileUpload1, group];

        const visitor = new AttachmentFieldsVisitor(logger);
        visitor.start(formConfig);

        expect(formConfig.attachmentFields).to.include("fileUpload1");
        expect(formConfig.attachmentFields).to.include("fileUpload2");
        expect(formConfig.attachmentFields?.length).to.equal(2);
    });

    it("should initialize attachmentFields as empty array if no attachments found", () => {
        const formConfig = new FormConfig();
        formConfig.componentDefinitions = [];

        const visitor = new AttachmentFieldsVisitor(logger);
        visitor.start(formConfig);

        expect(formConfig.attachmentFields).to.be.an("array");
        expect(formConfig.attachmentFields?.length).to.equal(0);
    });
});
