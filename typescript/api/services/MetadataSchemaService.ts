import {
    Services as services
} from '@researchdatabox/redbox-core-types';
import {
    Sails,
    Model
} from "sails";
import * as fluentJsonSchema from 'fluent-json-schema';
let fs = require('fs');
declare var sails: Sails;
declare var _;
declare var BrandingConfig;
declare var TranslationService;
declare var FormsService;

export module Services {
    
    export class MetadataSchema extends services.Core.Service {

        jsonSchema = fluentJsonSchema.default;

        componentDefinitionMap = {};
        checkboxFieldDefinition = {
            type: 'array',
            contains: {
                type: 'string'
            }
        };


            constructor() {
                super();
                this.componentDefinitionMap = {
                    TextField: {
                        type: 'string'
                    },
                    TextArea: {
                        type: 'string'
                    },
                    DateTime: {
                        type: 'string',
                        format: 'date'
                    },
                    SelectionField: {
                        type: 'string'
                    },
                    ContributorField: {
                        type: 'object',
                        id: 'contributor',
                        objectProperties: {
                            text_full_name: {
                                type: 'string'
                            },
                            email: {
                                type: 'string',
                                format: 'email'
                            },
                            orcid: {
                                type: 'string'
                            }
                        },
                        required: ['email']
                    },
                    ANDSVocab: {

                        type: 'array',
                        contains: {
                            type: 'object',
                            id: 'andsCode',
                            objectProperties: {
                                name: {
                                    type: 'string'
                                },
                                label: {
                                    type: 'string'
                                },
                                notation: {
                                    type: 'string'
                                }
                            }
                        }

                    },
                    RepeatableContributor: {
                        type: 'array',
                        contains: {
                            type: 'object',
                            id: 'contributor',
                            objectProperties: {
                                text_full_name: {
                                    type: 'string'
                                },
                                email: {
                                    type: 'string',
                                    format: 'email'
                                },
                                orcid: {
                                    type: 'string'
                                }
                            }
                        }

                    },
                    RepeatableContainer: {
                        type: 'array'
                    },
                    VocabField: {
                        type: 'string'
                    }
                }
            }

            protected _exportedMethods: any = [
                'generateSchema'
            ];

            public async generateSchema() {
                if (!fs.existsSync('/opt/redbox-portal/schemas/')) {
                    fs.mkdirSync('/opt/redbox-portal/schemas/');
                }
                let forms = await FormsService.listForms().toPromise();
                
                for(let formConfig of forms) {

                let schema = this.jsonSchema.object()
                    .id(`https://redbox/schema/${formConfig.name}`)
                    if(!_.isEmpty(formConfig.documentation)) {
                    if(formConfig.documentation.title != null) {
                    schema = schema.title(formConfig.documentation.title)
                    }
                    if(formConfig.documentation.description != null) {
                      schema = schema.description(formConfig.documentation.description);
                    }
                }
                schema = this.processFields(formConfig.fields, schema)

                fs.writeFileSync(`/opt/redbox-portal/schemas/${formConfig.name}.schema.json`, JSON.stringify(schema.valueOf(), undefined, 2));
            }
                // console.log()
            }

            private processFields(fields: any[], schema: any) {
                let definitionsMap = {}
                for (let field of fields) {

                    if (field.viewOnly == null || !field.viewOnly) {
                        let name = null;
                        if (!_.isEmpty(field.definition.name)) {
                            name = field.definition.name
                        }
                        if (name != null) {

                            let jsonSchemaField: any = this.handleDocumentation(field, definitionsMap);


                            if (jsonSchemaField != null) {

                                if (field.definition.required) {
                                    jsonSchemaField = jsonSchemaField.required();
                                }
                                schema = schema.prop(name, jsonSchemaField)
                            }


                        } else if (!_.isEmpty(field.definition.fields)) {

                            schema = this.processFields(field.definition.fields, schema)

                        }
                    
                    }
                }

                for (let key in definitionsMap) {
                    schema = schema.definition(key, definitionsMap[key]);
                }

                return schema;
            }

            private handleDocumentation(field: any, definitionsMap: any) {
                

                
                
                let description = TranslationService.t(field.definition.label)
                if(_.isEmpty(description)) {
                    description = field.definition.label;
                    
                }
                let documentation: any = {
                    description: description
                }
                if (this.componentDefinitionMap[field.class] != null) {
                    let componentDefinition = this.componentDefinitionMap[field.class];
                    if (field.class == 'SelectionField' && field.definition.controlType == 'checkbox') {
                        
                        componentDefinition = _.clone(this.checkboxFieldDefinition);
                    }

                    _.merge(documentation, componentDefinition)
                  
                }
                if (!_.isEmpty(field.documentation)) {
                    _.merge(documentation, field.documentation)

                }

                let jsonSchemaField = null;
                if (documentation.type == 'string') {
                    jsonSchemaField = this.handleString(documentation, definitionsMap, field)
                } else if (documentation.type == 'object') {
                    jsonSchemaField = this.handleObject(documentation, definitionsMap, field)
                } else if (documentation.type == 'array') {
                    jsonSchemaField = this.handleArray(documentation, definitionsMap, field)
                } else {
                    console.warn(`No type definition found for class ${field.class}`)
                }
                return jsonSchemaField;
            }

            private handleString(documentation: any, definitionsMap: any, field: any) {
                let jsonSchemaField = this.jsonSchema.string().description(documentation.description)
                if (documentation.pattern != undefined) {
                    jsonSchemaField.pattern(documentation.pattern)
                }

                return jsonSchemaField;
            }

            private handleArray(documentation: any, definitionsMap: any, field ? : any) {

                let jsonArray = this.jsonSchema.array()
                let containsObject = null;
                let containsType = null;
                let id = null;
                if (!_.isEmpty(documentation.contains)) {
                    let containsField = {
                        definition: {
                            name: null
                        },
                        documentation: documentation.contains
                    }
                    containsType = containsField.documentation.type;
                    id = containsField.documentation.id;
                    containsObject = this.handleDocumentation(containsField, definitionsMap)
                } else {
                    id = field.definition.name;
                    let containsDefinition = this.buildContainsDefinition(field.definition.fields);

                    let containsField = {
                        definition: {
                            name: null
                        },
                        documentation: containsDefinition
                    }

                    containsObject = this.handleDocumentation(containsField, definitionsMap)
                }
                if (containsType != null) {
                    if (containsType == 'object') {
                        jsonArray = jsonArray.contains(this.jsonSchema.ref(`#${id}`))
                    } else {
                        jsonArray = jsonArray.contains(containsObject);
                    }
                }

                jsonArray = jsonArray.description(documentation.description)
                return jsonArray;
            }

            private buildContainsDefinition(fields) {

                if (fields.length == 1) {
                    let field = fields[0];
                    let documentation: any = {}
                    if (this.componentDefinitionMap[field.class] != null) {
                        _.merge(documentation, this.componentDefinitionMap[field.class])
                    }
                    if (!_.isEmpty(field.documentation)) {
                        _.merge(documentation, field.documentation)
                    }
                    return documentation;
                } else {
                    let definition = {}

                    return definition;
                }
            }

            private handleObject(documentation: any, definitionsMap: any, field ? : any) {
                let jsonSchemaField = this.jsonSchema.object().description(documentation.description)

                let id = documentation.id;
                if (definitionsMap[id] == null) {
                    if (_.isEmpty(documentation.id)) {
                        id = 11111
                    }
                    let objectDef = this.jsonSchema.object().id(`#${id}`)


                    for (let key in documentation.objectProperties) {
                        let subDocumentation = documentation.objectProperties[key];
                        
                        let subField = {
                            definition: {
                                name: key
                            },
                            documentation: subDocumentation
                        }
                        let field = this.handleDocumentation(subField, definitionsMap);
                        if (field != null) {
                            objectDef = objectDef.prop(key, field);
                        }
                    }
                    if (documentation.required != null) {
                        objectDef = objectDef.required(documentation.required)
                    }


                    definitionsMap[id] = objectDef;
                }

                jsonSchemaField = jsonSchemaField.prop(field.definition.name, this.jsonSchema.ref(`#${id}`))

                return jsonSchemaField;
            }

        }



    }

    module.exports = new Services.MetadataSchema().exports();