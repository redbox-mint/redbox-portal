import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FormComponentGenerator } from '../../src/generators/form-component';
import { resolvePaths } from '../../src/utils/paths';

describe('FormComponentGenerator', () => {
  let tempRoot: string;

  const writeFile = (relativePath: string, content: string) => {
    const filePath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-form-component-test-'));
    writeFile('packages/redbox-core-types/package.json', '{}');

    writeFile(
      'packages/sails-ng-common/src/config/dictionary.outline.ts',
      `import {CheckboxTreeTypes} from "./component/checkbox-tree.outline";
export type AllTypes =
    | CheckboxTreeTypes
    ;
`
    );
    writeFile(
      'packages/sails-ng-common/src/config/dictionary.model.ts',
      `import {CheckboxTreeDefaults, CheckboxTreeMap} from "./component/checkbox-tree.model";
export const AllDefs = [
    ...CheckboxTreeMap,
] as const;
const RawDefaults = [
    CheckboxTreeDefaults,
]
`
    );
    writeFile(
      'packages/sails-ng-common/src/index.ts',
      `export * from "./config/component/checkbox-tree.model";
export * from "./config/component/checkbox-tree.outline";
// validation
`
    );
    writeFile(
      'packages/sails-ng-common/src/config/visitor/base.outline.ts',
      `import {
    CheckboxTreeFieldComponentDefinitionOutline,
    CheckboxTreeFieldModelDefinitionOutline,
    CheckboxTreeFormComponentDefinitionOutline
} from "../component/checkbox-tree.outline";
export interface FormConfigVisitorOutline {
    visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void;
    visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void;
    visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void;
}
`
    );
    writeFile(
      'packages/sails-ng-common/src/config/visitor/base.model.ts',
      `import {
    CheckboxTreeFieldComponentDefinitionOutline,
    CheckboxTreeFieldModelDefinitionOutline,
    CheckboxTreeFormComponentDefinitionOutline
} from "../component/checkbox-tree.outline";
export abstract class FormConfigVisitor {
    visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }
    visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {
        this.notImplemented();
    }
    visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
        this.notImplemented();
    }
    /* Shared */
    protected notImplemented() {}
}
`
    );

    const simpleVisitorScaffold = `import {
    CheckboxTreeFieldComponentDefinitionOutline,
    CheckboxTreeFieldModelDefinitionOutline,
    CheckboxTreeFormComponentDefinitionOutline
} from "../component/checkbox-tree.outline";
export class X {
    visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {}
    visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {}
    visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {}
    /* Dropdown Input */
}
`;
    writeFile('packages/sails-ng-common/src/config/visitor/client.visitor.ts', simpleVisitorScaffold);
    writeFile(
      'packages/sails-ng-common/src/config/visitor/data-value.visitor.ts',
      simpleVisitorScaffold
        .replace('this.processFieldComponentDefinition(item);', '')
        .replace('this.processFieldModelDefinition(item);', '')
    );
    writeFile('packages/sails-ng-common/src/config/visitor/json-type-def.visitor.ts', simpleVisitorScaffold);
    writeFile('packages/sails-ng-common/src/config/visitor/validator.visitor.ts', simpleVisitorScaffold);
    writeFile('packages/sails-ng-common/src/config/visitor/template.visitor.ts', simpleVisitorScaffold);

    writeFile(
      'packages/sails-ng-common/src/config/visitor/construct.visitor.ts',
      `import {
    CheckboxTreeComponentName,
    CheckboxTreeFieldComponentDefinitionFrame,
    CheckboxTreeFieldComponentDefinitionOutline,
    CheckboxTreeFieldModelDefinitionFrame,
    CheckboxTreeFieldModelDefinitionOutline,
    CheckboxTreeFormComponentDefinitionOutline,
    CheckboxTreeModelName
} from "../component/checkbox-tree.outline";
import {CheckboxTreeFieldComponentConfig, CheckboxTreeFieldModelConfig} from "../component/checkbox-tree.model";
export class ConstructVisitor {
    private formPathHelper = { formPath: { formConfig: '' } };
    private sharedProps = { sharedPopulateFieldComponentConfig() {}, sharedPopulateFieldModelConfig() {} };
    private getData() { return {}; }
    private setModelValue() {}
    private populateFormComponent() {}
    visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {}
    visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {}
    visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {}
    /* Dropdown Input */
}
`
    );

    writeFile(
      'packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts',
      `import {
    CheckboxTreeFieldComponentDefinitionOutline,
    CheckboxTreeFieldModelDefinitionOutline,
    CheckboxTreeFormComponentDefinitionOutline
} from "../component/checkbox-tree.outline";
import {CheckboxTreeFieldComponentConfig, CheckboxTreeFieldModelConfig} from "../component/checkbox-tree.model";
export class MigrateVisitor {
    private getV4Data() { return {}; }
    private sharedPopulateFieldComponentConfig() {}
    private sharedPopulateFieldModelConfig() {}
    private populateFormComponent() {}
    visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {}
    visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {}
    visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {}
    /* Dropdown Input */
}
`
    );

    writeFile(
      'angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts',
      `import {CheckboxTreeComponent, CheckboxTreeModel} from "./component/checkbox-tree.component";
import {
  CheckboxTreeModelName,
  CheckboxTreeComponentName,
} from "@researchdatabox/sails-ng-common";
export const StaticComponentClassMap = {
  [CheckboxTreeComponentName]: CheckboxTreeComponent,
};
export const StaticModelClassMap = {
  [CheckboxTreeModelName]: CheckboxTreeModel,
};
`
    );
    writeFile(
      'angular/projects/researchdatabox/form/src/app/form.module.ts',
      `import { NgModule } from '@angular/core';
import { CheckboxTreeComponent } from './component/checkbox-tree.component';
@NgModule({
  declarations: [
    CheckboxTreeComponent,
  ],
})
export class FormModule { }
`
    );
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('generates component scaffold and updates wiring', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new FormComponentGenerator({
      name: 'my-widget',
      root: tempRoot,
      paths
    });
    await generator.generate();
    await generator.generate();

    const outlinePath = path.join(tempRoot, 'packages/sails-ng-common/src/config/component/my-widget.outline.ts');
    const modelPath = path.join(tempRoot, 'packages/sails-ng-common/src/config/component/my-widget.model.ts');
    const angularCompPath = path.join(tempRoot, 'angular/projects/researchdatabox/form/src/app/component/my-widget.component.ts');
    const angularSpecPath = path.join(tempRoot, 'angular/projects/researchdatabox/form/src/app/component/my-widget.component.spec.ts');

    expect(fs.existsSync(outlinePath)).to.equal(true);
    expect(fs.existsSync(modelPath)).to.equal(true);
    expect(fs.existsSync(angularCompPath)).to.equal(true);
    expect(fs.existsSync(angularSpecPath)).to.equal(true);

    const dictionaryModel = fs.readFileSync(path.join(tempRoot, 'packages/sails-ng-common/src/config/dictionary.model.ts'), 'utf-8');
    expect(dictionaryModel).to.contain('MyWidgetMap');
    expect(dictionaryModel).to.contain('MyWidgetDefaults');

    const baseOutline = fs.readFileSync(path.join(tempRoot, 'packages/sails-ng-common/src/config/visitor/base.outline.ts'), 'utf-8');
    const matchCount = (baseOutline.match(/visitMyWidgetFieldComponentDefinition/g) || []).length;
    expect(matchCount).to.equal(1);

    const formModule = fs.readFileSync(path.join(tempRoot, 'angular/projects/researchdatabox/form/src/app/form.module.ts'), 'utf-8');
    expect(formModule).to.contain('MyWidgetComponent');
  });

  it('generates companion service when requested', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new FormComponentGenerator({
      name: 'my-widget',
      withService: true,
      root: tempRoot,
      paths
    });
    await generator.generate();

    const servicePath = path.join(tempRoot, 'angular/projects/researchdatabox/form/src/app/service/my-widget.service.ts');
    const serviceSpecPath = path.join(tempRoot, 'angular/projects/researchdatabox/form/src/app/service/my-widget.service.spec.ts');
    expect(fs.existsSync(servicePath)).to.equal(true);
    expect(fs.existsSync(serviceSpecPath)).to.equal(true);
  });
});
