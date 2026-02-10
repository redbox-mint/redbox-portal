import * as path from 'path';
import { Generator, GeneratorOptions } from '../utils/generator';

export interface FormFieldGeneratorOptions extends GeneratorOptions {
  name: string;
  type: string;
}

export class FormFieldGenerator extends Generator {
  private name: string;
  private type: string;

  constructor(options: FormFieldGeneratorOptions) {
    super(options);
    this.name = options.name;
    this.type = options.type;
  }

  public async generate(): Promise<void> {
    const fileName = this.name.endsWith('.js') ? this.name : `${this.name}.js`;
    const filePath = path.join(this.root, 'form-config', fileName);
    
    const content = this.generateFormContent();
    this.writeFile(filePath, content);
  }

  private escapeJsString(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  private generateFormContent(): string {
    const escapedName = this.escapeJsString(this.name);
    const escapedType = this.escapeJsString(this.type);

    return `/**
 * ${escapedName} form configuration
 */
module.exports = {
  name: '${escapedName}',
  type: '${escapedType}',
  skipValidationOnSave: false,
  editCssClasses: 'row col-md-12',
  viewCssClasses: 'row col-md-offset-1 col-md-10',
  messages: {
    "saving": ["@dmpt-form-saving"],
    "validationFail": ["@dmpt-form-validation-fail-prefix", "@dmpt-form-validation-fail-suffix"],
    "saveSuccess": ["@dmpt-form-save-success"],
    "saveError": ["@dmpt-form-save-error"]
  },
  fields: [
    {
      class: 'Container',
      compClass: 'TextBlockComponent',
      viewOnly: true,
      definition: {
        name: 'titleBlock',
        type: 'h1',
        value: '\${title}'
      }
    },
    {
      class: 'TextField',
      definition: {
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true
      }
    },
    {
      class: 'TextArea',
      definition: {
        name: 'description',
        label: 'Description',
        type: 'text'
      }
    },
    {
      class: "ButtonBarContainer",
      compClass: "ButtonBarContainerComponent",
      definition: {
        fields: [
          {
            class: "SaveButton",
            definition: {
              label: '@save-button',
              cssClasses: 'btn-success'
            }
          },
          {
            class: "CancelButton",
            definition: {
              label: '@close-button',
            }
          }
        ]
      }
    }
  ]
};
`;
  }
}
