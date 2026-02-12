import * as fs from 'fs';
import * as path from 'path';
import { Generator, GeneratorOptions } from '../utils/generator';
import { RedboxPaths } from '../utils/paths';

export interface FormComponentGeneratorOptions extends GeneratorOptions {
  name: string;
  app?: string;
  withService?: boolean;
  paths: RedboxPaths;
}

export class FormComponentGenerator extends Generator {
  private readonly rawName: string;
  private readonly app: string;
  private readonly withService: boolean;
  private readonly paths: RedboxPaths;

  private readonly kebabName: string;
  private readonly pascalName: string;
  private readonly componentClassName: string;
  private readonly modelClassName: string;
  private readonly componentNameConstant: string;
  private readonly modelNameConstant: string;

  constructor(options: FormComponentGeneratorOptions) {
    super(options);
    this.rawName = options.name;
    this.app = options.app ?? 'form';
    this.withService = !!options.withService;
    this.paths = options.paths;

    this.kebabName = this.toKebabCase(this.rawName);
    this.pascalName = this.toPascalCase(this.kebabName);
    this.componentClassName = `${this.pascalName}Component`;
    this.modelClassName = `${this.pascalName}Model`;
    this.componentNameConstant = `${this.pascalName}ComponentName`;
    this.modelNameConstant = `${this.pascalName}ModelName`;
  }

  public async generate(): Promise<void> {
    this.generateSailsNgCommonComponentFiles();
    this.generateAngularComponentFiles();
    if (this.withService) {
      this.generateAngularServiceFiles();
    }

    this.updateSailsNgCommonDictionaries();
    this.updateSailsNgCommonIndex();
    this.updateBaseVisitors();
    this.updateConcreteVisitors();
    this.updateAngularWiring();
  }

  private toKebabCase(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      throw new Error('Form component name cannot be empty.');
    }
    const normalized = trimmed
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    if (!normalized) {
      throw new Error(`Form component name is invalid: '${value}'`);
    }
    return normalized;
  }

  private toPascalCase(value: string): string {
    return value
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  private readFile(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required file not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private updateTextFile(filePath: string, updater: (content: string) => string): void {
    const content = this.readFile(filePath);
    const updated = updater(content);
    if (updated !== content) {
      this.writeFile(filePath, updated);
    }
  }

  private insertBeforeMarker(content: string, marker: string, addition: string): string {
    const signature = addition.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
    if ((signature && content.includes(signature)) || content.includes(addition.trim())) {
      return content;
    }
    const idx = content.indexOf(marker);
    if (idx === -1) {
      throw new Error(`Unable to find insertion marker '${marker}'.`);
    }
    return `${content.slice(0, idx)}${addition}${content.slice(idx)}`;
  }

  private ensureImport(content: string, importLine: string): string {
    const sourceMatch = importLine.match(/from\s+["']([^"']+)["']/);
    if (sourceMatch?.[1]) {
      const source = sourceMatch[1];
      if (content.includes(`from "${source}"`) || content.includes(`from '${source}'`)) {
        return content;
      }
    }
    if (content.includes(importLine)) {
      return content;
    }
    const lines = content.split('\n');
    let insertAt = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].startsWith('import ')) {
        insertAt = i;
      } else if (insertAt !== -1) {
        break;
      }
    }
    if (insertAt === -1) {
      throw new Error('Unable to find import section.');
    }
    lines.splice(insertAt + 1, 0, importLine);
    return `${lines.join('\n')}`;
  }

  private appendToObjectLiteral(content: string, objectDeclRegex: RegExp, lineToAdd: string): string {
    if (content.includes(lineToAdd.trim())) {
      return content;
    }
    const match = objectDeclRegex.exec(content);
    if (!match || typeof match.index !== 'number') {
      throw new Error(`Unable to find object literal using pattern ${objectDeclRegex}.`);
    }
    const startIdx = content.indexOf('{', match.index);
    if (startIdx === -1) {
      throw new Error('Unable to find object opening brace.');
    }
    const endIdx = this.findMatchingDelimiter(content, startIdx, '{', '}');
    if (endIdx === -1) {
      throw new Error('Unable to locate end of object literal.');
    }
    return `${content.slice(0, endIdx)}${lineToAdd}${content.slice(endIdx)}`;
  }

  private appendToArrayLiteral(content: string, arrayDeclRegex: RegExp, lineToAdd: string): string {
    if (content.includes(lineToAdd.trim())) {
      return content;
    }
    const match = arrayDeclRegex.exec(content);
    if (!match || typeof match.index !== 'number') {
      throw new Error(`Unable to find array literal using pattern ${arrayDeclRegex}.`);
    }
    const startIdx = content.indexOf('[', match.index);
    if (startIdx === -1) {
      throw new Error('Unable to find array opening bracket.');
    }
    const endIdx = this.findMatchingDelimiter(content, startIdx, '[', ']');
    if (endIdx === -1) {
      throw new Error('Unable to locate end of array literal.');
    }
    return `${content.slice(0, endIdx)}${lineToAdd}${content.slice(endIdx)}`;
  }

  private findMatchingDelimiter(content: string, startIdx: number, openChar: '{' | '[', closeChar: '}' | ']'): number {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplateLiteral = false;
    let inLineComment = false;
    let inBlockComment = false;
    let isEscaped = false;

    for (let i = startIdx; i < content.length; i += 1) {
      const ch = content[i];
      const nextCh = content[i + 1] ?? '';

      if (inLineComment) {
        if (ch === '\n' || ch === '\r') {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === '*' && nextCh === '/') {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (inSingleQuote) {
        if (ch === '\\' && !isEscaped) {
          isEscaped = true;
          continue;
        }
        if (ch === '\'' && !isEscaped) {
          inSingleQuote = false;
        }
        isEscaped = false;
        continue;
      }

      if (inDoubleQuote) {
        if (ch === '\\' && !isEscaped) {
          isEscaped = true;
          continue;
        }
        if (ch === '"' && !isEscaped) {
          inDoubleQuote = false;
        }
        isEscaped = false;
        continue;
      }

      if (inTemplateLiteral) {
        if (ch === '\\' && !isEscaped) {
          isEscaped = true;
          continue;
        }
        if (ch === '`' && !isEscaped) {
          inTemplateLiteral = false;
        }
        isEscaped = false;
        continue;
      }

      if (ch === '/' && nextCh === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === '/' && nextCh === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === '\'') {
        inSingleQuote = true;
        isEscaped = false;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = true;
        isEscaped = false;
        continue;
      }
      if (ch === '`') {
        inTemplateLiteral = true;
        isEscaped = false;
        continue;
      }

      if (ch === openChar) {
        depth += 1;
      } else if (ch === closeChar) {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  private generateSailsNgCommonComponentFiles(): void {
    const componentDir = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'component');
    const outlinePath = path.join(componentDir, `${this.kebabName}.outline.ts`);
    const modelPath = path.join(componentDir, `${this.kebabName}.model.ts`);

    const outlineContent = `import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";

/* ${this.pascalName} Component */
export const ${this.componentNameConstant} = "${this.componentClassName}" as const;
export type ${this.componentNameConstant}Type = typeof ${this.componentNameConstant};

export interface ${this.pascalName}FieldComponentConfigFrame extends FieldComponentConfigFrame {
}

export interface ${this.pascalName}FieldComponentConfigOutline extends ${this.pascalName}FieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface ${this.pascalName}FieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: ${this.componentNameConstant}Type;
    config?: ${this.pascalName}FieldComponentConfigFrame;
}

export interface ${this.pascalName}FieldComponentDefinitionOutline extends ${this.pascalName}FieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: ${this.componentNameConstant}Type;
    config?: ${this.pascalName}FieldComponentConfigOutline;
}

/* ${this.pascalName} Model */
export const ${this.modelNameConstant} = "${this.modelClassName}" as const;
export type ${this.modelNameConstant}Type = typeof ${this.modelNameConstant};
export type ${this.pascalName}ModelValueType = unknown;

export interface ${this.pascalName}FieldModelConfigFrame extends FieldModelConfigFrame<${this.pascalName}ModelValueType> {
}

export interface ${this.pascalName}FieldModelConfigOutline extends ${this.pascalName}FieldModelConfigFrame, FieldModelConfigOutline<${this.pascalName}ModelValueType> {
}

export interface ${this.pascalName}FieldModelDefinitionFrame extends FieldModelDefinitionFrame<${this.pascalName}ModelValueType> {
    class: ${this.modelNameConstant}Type;
    config?: ${this.pascalName}FieldModelConfigFrame;
}

export interface ${this.pascalName}FieldModelDefinitionOutline extends ${this.pascalName}FieldModelDefinitionFrame, FieldModelDefinitionOutline<${this.pascalName}ModelValueType> {
    class: ${this.modelNameConstant}Type;
    config?: ${this.pascalName}FieldModelConfigOutline;
}

/* ${this.pascalName} Form Component */
export interface ${this.pascalName}FormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: ${this.pascalName}FieldComponentDefinitionFrame;
    model?: ${this.pascalName}FieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface ${this.pascalName}FormComponentDefinitionOutline extends ${this.pascalName}FormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: ${this.pascalName}FieldComponentDefinitionOutline;
    model?: ${this.pascalName}FieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type ${this.pascalName}Types =
    | { kind: FieldComponentConfigFrameKindType, class: ${this.pascalName}FieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: ${this.pascalName}FieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: ${this.pascalName}FieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: ${this.pascalName}FieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: ${this.pascalName}FormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: ${this.pascalName}FieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: ${this.pascalName}FieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: ${this.pascalName}FieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: ${this.pascalName}FieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: ${this.pascalName}FormComponentDefinitionOutline }
    ;
`;

    const modelContent = `import {FieldModelConfig, FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {FieldComponentConfig, FieldComponentDefinition} from "../field-component.model";
import {AvailableFieldLayoutDefinitionOutlines} from "../dictionary.outline";
import {
    ${this.componentNameConstant},
    ${this.pascalName}FieldComponentConfigOutline,
    ${this.pascalName}FieldComponentDefinitionOutline,
    ${this.pascalName}FieldModelConfigOutline,
    ${this.pascalName}FieldModelDefinitionOutline,
    ${this.pascalName}FormComponentDefinitionOutline,
    ${this.modelNameConstant},
    ${this.pascalName}ModelValueType
} from "./${this.kebabName}.outline";

/* ${this.pascalName} Component */

export class ${this.pascalName}FieldComponentConfig extends FieldComponentConfig implements ${this.pascalName}FieldComponentConfigOutline {
    constructor() {
        super();
    }
}

export class ${this.pascalName}FieldComponentDefinition extends FieldComponentDefinition implements ${this.pascalName}FieldComponentDefinitionOutline {
    class = ${this.componentNameConstant};
    config?: ${this.pascalName}FieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visit${this.pascalName}FieldComponentDefinition(this);
    }
}

/* ${this.pascalName} Model */

export class ${this.pascalName}FieldModelConfig extends FieldModelConfig<${this.pascalName}ModelValueType> implements ${this.pascalName}FieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class ${this.pascalName}FieldModelDefinition extends FieldModelDefinition<${this.pascalName}ModelValueType> implements ${this.pascalName}FieldModelDefinitionOutline {
    class = ${this.modelNameConstant};
    config?: ${this.pascalName}FieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visit${this.pascalName}FieldModelDefinition(this);
    }
}

/* ${this.pascalName} Form Component */

export class ${this.pascalName}FormComponentDefinition extends FormComponentDefinition implements ${this.pascalName}FormComponentDefinitionOutline {
    public component!: ${this.pascalName}FieldComponentDefinitionOutline;
    public model?: ${this.pascalName}FieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visit${this.pascalName}FormComponentDefinition(this);
    }
}

export const ${this.pascalName}Map = [
    {kind: FieldComponentConfigKind, def: ${this.pascalName}FieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: ${this.pascalName}FieldComponentDefinition, class: ${this.componentNameConstant}},
    {kind: FieldModelConfigKind, def: ${this.pascalName}FieldModelConfig},
    {kind: FieldModelDefinitionKind, def: ${this.pascalName}FieldModelDefinition, class: ${this.modelNameConstant}},
    {kind: FormComponentDefinitionKind, def: ${this.pascalName}FormComponentDefinition, class: ${this.componentNameConstant}},
];
export const ${this.pascalName}Defaults = {
    [FormComponentDefinitionKind]: {
        [${this.componentNameConstant}]: {
            [FieldComponentDefinitionKind]: ${this.componentNameConstant},
            [FieldModelDefinitionKind]: ${this.modelNameConstant},
        }
    }
};
`;

    this.writeFile(outlinePath, outlineContent);
    this.writeFile(modelPath, modelContent);
  }

  private generateAngularComponentFiles(): void {
    const appDir = path.join(this.paths.angular, 'projects', 'researchdatabox', this.app, 'src', 'app');
    const componentPath = path.join(appDir, 'component', `${this.kebabName}.component.ts`);
    const specPath = path.join(appDir, 'component', `${this.kebabName}.component.spec.ts`);

    const componentContent = `import { Component, Input, Injector, inject } from "@angular/core";
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  ${this.componentNameConstant},
  ${this.pascalName}FieldComponentConfig,
  ${this.modelNameConstant},
  ${this.pascalName}ModelValueType
} from "@researchdatabox/sails-ng-common";
import { FormComponent } from "../form.component";

export class ${this.modelClassName} extends FormFieldModel<${this.pascalName}ModelValueType> {
  protected override logName = ${this.modelNameConstant};
}

@Component({
  selector: "redbox-${this.kebabName}",
  template: \`
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <div class="redbox-${this.kebabName}">
        <!-- TODO: implement ${this.componentClassName} UI -->
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  \`,
  standalone: false
})
export class ${this.componentClassName} extends FormFieldBaseComponent<${this.pascalName}ModelValueType> {
  protected override logName = ${this.componentNameConstant};
  private readonly injector = inject(Injector);

  @Input() public override model?: ${this.modelClassName};

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    const cfg = (this.componentDefinition?.config as ${this.pascalName}FieldComponentConfig) ?? new ${this.pascalName}FieldComponentConfig();
    void cfg;
  }

  protected override async initData(): Promise<void> {
    // TODO: initialize async data for ${this.componentClassName} when needed.
  }
}
`;

    const specContent = `import { TestBed } from "@angular/core/testing";
import { ${this.componentClassName} } from "./${this.kebabName}.component";
import { createTestbedModule } from "../helpers.spec";

describe("${this.componentClassName}", () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "${this.componentClassName}": ${this.componentClassName}
      }
    });
  });

  it("should create component", () => {
    const fixture = TestBed.createComponent(${this.componentClassName});
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
});
`;

    this.writeFile(componentPath, componentContent);
    this.writeFile(specPath, specContent);
  }

  private generateAngularServiceFiles(): void {
    const appDir = path.join(this.paths.angular, 'projects', 'researchdatabox', this.app, 'src', 'app');
    const servicePath = path.join(appDir, 'service', `${this.kebabName}.service.ts`);
    const specPath = path.join(appDir, 'service', `${this.kebabName}.service.spec.ts`);
    const serviceClassName = `${this.pascalName}Service`;

    const serviceContent = `import { APP_BASE_HREF } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Inject, Injectable } from "@angular/core";
import { ConfigService, HttpClientService, UtilityService } from "@researchdatabox/portal-ng-common";

@Injectable({ providedIn: "root" })
export class ${serviceClassName} extends HttpClientService {
  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }
}
`;

    const specContent = `import { TestBed } from "@angular/core/testing";
import { APP_BASE_HREF } from "@angular/common";
import { provideHttpClient } from "@angular/common/http";
import {
  ConfigService,
  getStubConfigService,
  LoggerService,
  UtilityService
} from "@researchdatabox/portal-ng-common";
import { ${serviceClassName} } from "./${this.kebabName}.service";

describe("${serviceClassName}", () => {
  it("should create service", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_BASE_HREF, useValue: "" },
        { provide: ConfigService, useValue: getStubConfigService() },
        LoggerService,
        UtilityService,
        provideHttpClient(),
        ${serviceClassName}
      ]
    });

    const service = TestBed.inject(${serviceClassName});
    expect(service).toBeDefined();
  });
});
`;

    this.writeFile(servicePath, serviceContent);
    this.writeFile(specPath, specContent);
  }

  private updateSailsNgCommonDictionaries(): void {
    const dictionaryOutlinePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'dictionary.outline.ts');
    this.updateTextFile(dictionaryOutlinePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {${this.pascalName}Types} from "./component/${this.kebabName}.outline";`
      );
      updated = this.insertBeforeMarker(updated, '    ;', `    | ${this.pascalName}Types\n`);
      return updated;
    });

    const dictionaryModelPath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'dictionary.model.ts');
    this.updateTextFile(dictionaryModelPath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {${this.pascalName}Defaults, ${this.pascalName}Map} from "./component/${this.kebabName}.model";`
      );
      updated = this.appendToArrayLiteral(updated, /export const AllDefs\s*=\s*\[/, `    ...${this.pascalName}Map,\n`);
      updated = this.appendToArrayLiteral(updated, /const RawDefaults\s*=\s*\[/, `    ${this.pascalName}Defaults,\n`);
      return updated;
    });
  }

  private updateSailsNgCommonIndex(): void {
    const indexPath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'index.ts');
    this.updateTextFile(indexPath, (content) => {
      let updated = content;
      const exportModelLine = `export * from "./config/component/${this.kebabName}.model";`;
      const exportOutlineLine = `export * from "./config/component/${this.kebabName}.outline";`;
      if (!updated.includes(exportModelLine)) {
        updated = this.insertBeforeMarker(updated, '// validation', `${exportModelLine}\n`);
      }
      if (!updated.includes(exportOutlineLine)) {
        updated = this.insertBeforeMarker(updated, '// validation', `${exportOutlineLine}\n`);
      }
      return updated;
    });
  }

  private updateBaseVisitors(): void {
    const baseOutlinePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'base.outline.ts');
    this.updateTextFile(baseOutlinePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      const methodsBlock = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void;

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void;

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void;
`;
      updated = this.insertBeforeMarker(updated, '\n}', methodsBlock);
      return updated;
    });

    const baseModelPath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'base.model.ts');
    this.updateTextFile(baseModelPath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      const methodsBlock = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.notImplemented();
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Shared */', methodsBlock);
      return updated;
    });
  }

  private updateConcreteVisitors(): void {
    this.updateClientVisitor();
    this.updateDataValueVisitor();
    this.updateJsonTypeDefVisitor();
    this.updateValidatorVisitor();
    this.updateTemplateVisitor();
    this.updateConstructVisitor();
    this.updateMigrateVisitor();
  }

  private updateClientVisitor(): void {
    const filePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'client.visitor.ts');
    this.updateTextFile(filePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      const block = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.acceptCheckConstraintsCurrentPath(item);
        this.processFormComponentDefinition(item);
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Dropdown Input */', block);
      return updated;
    });
  }

  private updateDataValueVisitor(): void {
    const filePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'data-value.visitor.ts');
    this.updateTextFile(filePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      const block = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
        this.acceptFieldComponentDefinition(item);
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
        this.acceptFieldModelDefinition(item);
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Dropdown Input */', block);
      return updated;
    });
  }

  private updateJsonTypeDefVisitor(): void {
    const filePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'json-type-def.visitor.ts');
    this.updateTextFile(filePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      const block = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
        this.acceptFieldComponentDefinition(item);
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
        this.acceptFieldModelDefinition(item);
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Dropdown Input */', block);
      return updated;
    });
  }

  private updateValidatorVisitor(): void {
    const filePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'validator.visitor.ts');
    this.updateTextFile(filePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      const block = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Dropdown Input */', block);
      return updated;
    });
  }

  private updateTemplateVisitor(): void {
    const filePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'template.visitor.ts');
    this.updateTextFile(filePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      const block = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Dropdown Input */', block);
      return updated;
    });
  }

  private updateConstructVisitor(): void {
    const filePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'construct.visitor.ts');
    this.updateTextFile(filePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.componentNameConstant},\n    ${this.pascalName}FieldComponentDefinitionFrame,\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionFrame,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline,\n    ${this.modelNameConstant}\n} from "../component/${this.kebabName}.outline";`
      );
      updated = this.ensureImport(
        updated,
        `import {${this.pascalName}FieldComponentConfig, ${this.pascalName}FieldModelConfig} from "../component/${this.kebabName}.model";`
      );
      const block = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<${this.pascalName}FieldComponentDefinitionFrame>(currentData, ${this.componentNameConstant})) {
            throw new Error(\`Invalid ${this.componentClassName} at '\${this.formPathHelper.formPath.formConfig}': \${JSON.stringify(currentData)}\`);
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new ${this.pascalName}FieldComponentConfig();
        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<${this.pascalName}FieldModelDefinitionFrame>(currentData, ${this.modelNameConstant})) {
            throw new Error(\`Invalid ${this.modelClassName} at '\${this.formPathHelper.formPath.formConfig}': \${JSON.stringify(currentData)}\`);
        }

        // Create the class instance for the config
        item.config = new ${this.pascalName}FieldModelConfig();
        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
        this.setModelValue(item, currentData?.config);
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Dropdown Input */', block);
      return updated;
    });
  }

  private updateMigrateVisitor(): void {
    const filePath = path.join(this.root, 'packages', 'sails-ng-common', 'src', 'config', 'visitor', 'migrate-config-v4-v5.visitor.ts');
    this.updateTextFile(filePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import {\n    ${this.pascalName}FieldComponentDefinitionOutline,\n    ${this.pascalName}FieldModelDefinitionOutline,\n    ${this.pascalName}FormComponentDefinitionOutline\n} from "../component/${this.kebabName}.outline";`
      );
      updated = this.ensureImport(
        updated,
        `import {${this.pascalName}FieldComponentConfig, ${this.pascalName}FieldModelConfig} from "../component/${this.kebabName}.model";`
      );
      const block = `
    /* ${this.pascalName} */

    visit${this.pascalName}FieldComponentDefinition(item: ${this.pascalName}FieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new ${this.pascalName}FieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visit${this.pascalName}FieldModelDefinition(item: ${this.pascalName}FieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new ${this.pascalName}FieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visit${this.pascalName}FormComponentDefinition(item: ${this.pascalName}FormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }
`;
      updated = this.insertBeforeMarker(updated, '\n    /* Dropdown Input */', block);
      return updated;
    });
  }

  private updateAngularWiring(): void {
    const staticDictionaryPath = path.join(
      this.paths.angular,
      'projects',
      'researchdatabox',
      this.app,
      'src',
      'app',
      'static-comp-field.dictionary.ts'
    );
    this.updateTextFile(staticDictionaryPath, (content) => {
      let updated = content;
      const compImport = `import {${this.componentClassName}, ${this.modelClassName}} from "./component/${this.kebabName}.component";`;
      const constantsImport = `  ${this.modelNameConstant},`;
      const constantsCompImport = `  ${this.componentNameConstant},`;
      updated = this.ensureImport(updated, compImport);
      const marker = '} from "@researchdatabox/sails-ng-common";';
      const insertMissingConstant = (source: string, constantLine: string): string => {
        if (source.includes(constantLine)) {
          return source;
        }
        const idx = source.indexOf(marker);
        if (idx === -1) {
          throw new Error(`Unable to find sails-ng-common import in ${staticDictionaryPath}`);
        }
        return `${source.slice(0, idx)}${constantLine}\n${source.slice(idx)}`;
      };
      updated = insertMissingConstant(updated, constantsImport);
      updated = insertMissingConstant(updated, constantsCompImport);
      updated = this.appendToObjectLiteral(
        updated,
        /export const StaticComponentClassMap[^=]*=\s*\{/,
        `  [${this.componentNameConstant}]: ${this.componentClassName},\n`
      );
      updated = this.appendToObjectLiteral(
        updated,
        /export const StaticModelClassMap[^=]*=\s*\{/,
        `  [${this.modelNameConstant}]: ${this.modelClassName},\n`
      );
      return updated;
    });

    const formModulePath = path.join(
      this.paths.angular,
      'projects',
      'researchdatabox',
      this.app,
      'src',
      'app',
      'form.module.ts'
    );
    this.updateTextFile(formModulePath, (content) => {
      let updated = this.ensureImport(
        content,
        `import { ${this.componentClassName} } from './component/${this.kebabName}.component';`
      );
      updated = this.appendToArrayLiteral(
        updated,
        /declarations:\s*\[/,
        `    ${this.componentClassName},\n`
      );
      return updated;
    });
  }
}
