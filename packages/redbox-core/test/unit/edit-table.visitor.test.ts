import {
    EditTableFieldComponentConfigOutline,
    FormConfigFrame,
    formValidatorsSharedDefinitions,
} from "@researchdatabox/sails-ng-common";
import * as _ from "lodash";
import {
    ConstructFormConfigVisitor,
    ClientFormConfigVisitor,
    reusableFormDefinitions,
    ValidatorFormConfigVisitor,
} from "../../src";
import { DataValueFormConfigVisitor } from "../../src/visitor/data-value.visitor";
import { TemplateFormConfigVisitor } from "../../src/visitor/template.visitor";
import { JsonTypeDefSchemaFormConfigVisitor } from "../../src/visitor/json-type-def.visitor";
import { AttachmentFieldsVisitor } from "../../src/visitor/attachment-fields.visitor";
import Services from "../../src/services/DomSanitizerService";
import { logger } from "./helpers";

const DomSanitizerService = new Services.DomSanitizer();

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

function editTableFormConfig(): FormConfigFrame {
    return {
        name: "edit-table-test-form",
        componentDefinitions: [
            {
                name: "contributors",
                component: {
                    class: "EditTableComponent",
                    config: {
                        label: "@contributors-label",
                        columns: [
                            { label: "@contributor-name", path: "name" },
                            { label: "@contributor-email", path: "contact.email", format: "{{value}} ({{index}})" },
                        ],
                        confirmDelete: true,
                        maxRows: 5,
                        componentDefinitions: [
                            {
                                name: "name",
                                component: { class: "SimpleInputComponent", config: {} },
                                model: {
                                    class: "SimpleInputModel",
                                    config: {
                                        validators: [{ class: "required" }],
                                    },
                                },
                            },
                            {
                                name: "email",
                                component: { class: "SimpleInputComponent", config: {} },
                                model: { class: "SimpleInputModel", config: {} },
                            },
                        ],
                    },
                },
                model: {
                    class: "EditTableModel",
                    config: {
                        defaultValue: [
                            { name: "Ada", email: "ada@example.com" },
                            { name: "Grace", email: "grace@example.com" },
                        ],
                    },
                },
            },
        ],
    };
}

async function constructForm(formConfig: FormConfigFrame) {
    const visitor = new ConstructFormConfigVisitor(logger);
    return await visitor.start({
        data: formConfig,
        reusableFormDefs: reusableFormDefinitions,
        formMode: "edit",
    });
}

describe("EditTable visitors", async () => {
    before(() => {
        (global as any)._ = _;
        (global as any).DomSanitizerService = DomSanitizerService;
        (globalThis as any).DomSanitizerService = DomSanitizerService;
    });

    describe("construct visitor", async () => {
        it("should construct the component, columns, children and model value", async () => {
            const actual = await constructForm(editTableFormConfig());

            const formComponent = actual.componentDefinitions[0];
            expect(formComponent.component.class).to.equal("EditTableComponent");
            expect(formComponent.model?.class).to.equal("EditTableModel");

            const config = formComponent.component.config as EditTableFieldComponentConfigOutline;
            expect(config.columns).to.eql([
                { label: "@contributor-name", path: "name" },
                { label: "@contributor-email", path: "contact.email", format: "{{value}} ({{index}})" },
            ]);
            expect(config.confirmDelete).to.equal(true);
            expect(config.maxRows).to.equal(5);

            // Children of the dialog sub-form are constructed.
            expect(config.componentDefinitions).to.have.lengthOf(2);
            expect(config.componentDefinitions[0].name).to.equal("name");
            expect(config.componentDefinitions[0].component.class).to.equal("SimpleInputComponent");
            expect(config.componentDefinitions[1].name).to.equal("email");

            // Model value is the array of rows.
            expect(formComponent.model?.config?.value).to.eql([
                { name: "Ada", email: "ada@example.com" },
                { name: "Grace", email: "grace@example.com" },
            ]);
        });

        it("should drop malformed column entries with a warning", async () => {
            const formConfig = editTableFormConfig();
            const componentConfig = (formConfig.componentDefinitions[0].component as any).config;
            componentConfig.columns = [
                { label: "@valid", path: "name" },
                { label: "", path: "name" },
                { path: "missing-label" },
                { label: "@missing-path" },
                "not-an-object",
            ];

            const actual = await constructForm(formConfig);
            const config = actual.componentDefinitions[0].component.config as EditTableFieldComponentConfigOutline;
            expect(config.columns).to.eql([{ label: "@valid", path: "name" }]);
        });

        it("should default to empty columns and children", async () => {
            const actual = await constructForm({
                name: "edit-table-empty",
                componentDefinitions: [
                    {
                        name: "rows",
                        component: { class: "EditTableComponent", config: {} },
                        model: { class: "EditTableModel", config: {} },
                    },
                ],
            } as FormConfigFrame);
            const config = actual.componentDefinitions[0].component.config as EditTableFieldComponentConfigOutline;
            expect(config.columns).to.eql([]);
            expect(config.componentDefinitions).to.eql([]);
            expect(config.confirmDelete).to.equal(false);
        });
    });

    describe("client visitor", async () => {
        it("should keep the component and its children in edit mode", async () => {
            const constructed = await constructForm(editTableFormConfig());
            const clientVisitor = new ClientFormConfigVisitor(logger);
            const actual = await clientVisitor.start({ form: constructed, formMode: "edit", userRoles: ["Admin"] });

            const formComponent = actual.componentDefinitions[0];
            expect(formComponent.component.class).to.equal("EditTableComponent");
            const config = formComponent.component.config as EditTableFieldComponentConfigOutline;
            expect(config.componentDefinitions).to.have.lengthOf(2);
        });

        it("should remove the component when the dialog sub-form has no components", async () => {
            const formConfig = editTableFormConfig();
            (formConfig.componentDefinitions[0].component as any).config.componentDefinitions = [];
            // Add a sibling component so the form itself is not emptied when the EditTable is removed.
            formConfig.componentDefinitions.push({
                name: "other_field",
                component: { class: "SimpleInputComponent", config: {} },
                model: { class: "SimpleInputModel", config: {} },
            });
            const constructed = await constructForm(formConfig);

            const clientVisitor = new ClientFormConfigVisitor(logger);
            const actual = await clientVisitor.start({ form: constructed, formMode: "edit", userRoles: ["Admin"] });

            // The EditTable component with no dialog sub-form components is removed.
            expect(actual.componentDefinitions).to.have.lengthOf(1);
            expect(actual.componentDefinitions[0].name).to.equal("other_field");
        });
    });

    describe("data value visitor", async () => {
        it("should set the array value from the model and not populate children", async () => {
            const constructed = await constructForm(editTableFormConfig());
            const dataValueVisitor = new DataValueFormConfigVisitor(logger);
            const actual = await dataValueVisitor.start({ form: constructed });

            expect(actual).to.eql({
                contributors: [
                    { name: "Ada", email: "ada@example.com" },
                    { name: "Grace", email: "grace@example.com" },
                ],
            });
        });
    });

    describe("template visitor", async () => {
        it("should extract column format templates with lineage keys", async () => {
            const constructed = await constructForm(editTableFormConfig());
            const templateVisitor = new TemplateFormConfigVisitor(logger);
            const actual = await templateVisitor.start({ form: constructed });

            expect(actual).to.deep.include({
                key: [
                    "componentDefinitions", "0", "component",
                    "config", "columns", "1", "format",
                ],
                value: "{{value}} ({{index}})",
                kind: "handlebars",
            });
        });
    });

    describe("json type def visitor", async () => {
        it("should build an array-of-objects schema from the dialog sub-form", async () => {
            const constructed = await constructForm(editTableFormConfig());
            const jsonTypeDefVisitor = new JsonTypeDefSchemaFormConfigVisitor(logger);
            const actual = await jsonTypeDefVisitor.start({ form: constructed });

            expect(actual).to.eql({
                properties: {
                    contributors: {
                        elements: {
                            properties: {
                                name: { type: "string" },
                                email: { type: "string" },
                            },
                        },
                    },
                },
            });
        });
    });

    describe("validator visitor", async () => {
        it("should run field-level validators against the array value", async () => {
            const formConfig = editTableFormConfig();
            (formConfig.componentDefinitions[0].model as any).config = {
                defaultValue: [],
                validators: [{ class: "required" }],
            };
            const constructed = await constructForm(formConfig);

            const validatorVisitor = new ValidatorFormConfigVisitor(logger);
            const actual = await validatorVisitor.start({
                form: constructed,
                validatorDefinitions: formValidatorsSharedDefinitions,
            });

            const contributorErrors = actual.filter(e => e.id === "contributors");
            expect(contributorErrors).to.have.lengthOf(1);
            expect((contributorErrors[0].errors ?? []).map(e => e.class)).to.include("required");
        });

        it("should pass when the array value satisfies field-level validators", async () => {
            const formConfig = editTableFormConfig();
            (formConfig.componentDefinitions[0].model as any).config.validators = [{ class: "required" }];
            const constructed = await constructForm(formConfig);

            const validatorVisitor = new ValidatorFormConfigVisitor(logger);
            const actual = await validatorVisitor.start({
                form: constructed,
                validatorDefinitions: formValidatorsSharedDefinitions,
            });

            expect(actual.filter(e => e.id === "contributors")).to.have.lengthOf(0);
        });
    });

    describe("attachment fields visitor", async () => {
        it("should discover file upload components inside the dialog sub-form", async () => {
            const formConfig = editTableFormConfig();
            (formConfig.componentDefinitions[0].component as any).config.componentDefinitions.push({
                name: "attachment",
                component: { class: "FileUploadComponent", config: {} },
                model: { class: "FileUploadModel", config: {} },
            });
            const constructed = await constructForm(formConfig);

            const attachmentVisitor = new AttachmentFieldsVisitor(logger);
            await attachmentVisitor.start(constructed);

            expect(constructed.attachmentFields).to.include("attachment");
        });
    });
});
