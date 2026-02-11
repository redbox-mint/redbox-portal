import * as path from 'path';
import { Project, QuoteKind } from 'ts-morph';
import { Generator, GeneratorOptions } from '../utils/generator';
import { RedboxPaths } from '../utils/paths';
import { updateModelIndex } from '../utils/config-helper';

export interface ModelAttribute {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'ref';
  required?: boolean;
  unique?: boolean;
  columnType?: string;
  defaultsTo?: string | number | boolean | Record<string, unknown> | unknown[] | null;
}

export interface ModelAssociation {
  name: string;
  type: 'belongsTo' | 'hasMany';
  model: string;
  via?: string;
  dominant?: boolean;
}

export interface ModelGeneratorOptions extends GeneratorOptions {
  name: string;
  attributes?: ModelAttribute[];
  associations?: ModelAssociation[];
  identity?: string;
  paths: RedboxPaths;
}

export class ModelGenerator extends Generator {
  private name: string;
  private attributes: ModelAttribute[];
  private associations: ModelAssociation[];
  private identity: string;
  private paths: RedboxPaths;
  private project: Project;

  constructor(options: ModelGeneratorOptions) {
    super(options);
    this.name = options.name;
    this.attributes = options.attributes || [];
    this.associations = options.associations || [];
    // Identity is the Waterline table/collection name (lowercase)
    this.identity = options.identity || options.name.toLowerCase().replace(/class$/i, '');
    this.paths = options.paths;
    this.project = new Project({
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
      },
    });
  }

  public async generate(): Promise<void> {
    // Ensure class name ends with 'Class' (convention for Waterline decorator models)
    const className = this.name.endsWith('Class') ? this.name : `${this.name}Class`;
    const baseName = className.replace(/Class$/, '');
    
    const modelDir = path.join(this.paths.coreTypes, 'src', 'waterline-models');
    const modelPath = path.join(modelDir, `${baseName}.ts`);
    
    const content = this.generateModelContent(baseName, className);
    this.writeFile(modelPath, content);

    if (!this.dryRun) {
      await updateModelIndex({
        project: this.project,
        paths: this.paths,
        root: this.root,
        modelName: baseName,
        dryRun: this.dryRun
      });
    }
  }

  private generateModelContent(baseName: string, className: string): string {
    const imports = this.buildImports();
    const decorators = this.buildDecorators();
    const properties = this.buildProperties();
    const wlDefExport = `${baseName}WLDef`;
    const attributesInterface = `${baseName}Attributes`;
    const waterlineModelInterface = `${baseName}WaterlineModel`;

    return `/// <reference path="../sails.ts" />
import { JsonMap } from './types';
${imports}

@Entity('${this.identity}')
export class ${className} {
${decorators}${properties}}

// Export the Waterline model definition for runtime use
export const ${wlDefExport} = toWaterlineModelDef(${className});

// Type interface for backwards compatibility
export interface ${attributesInterface} extends Sails.WaterlineAttributes {
${this.buildAttributesInterface()}}

export interface ${waterlineModelInterface} extends Sails.Model<${attributesInterface}> {
  attributes: ${attributesInterface};
}

declare global {
  var ${baseName}: ${waterlineModelInterface};
}
`;
  }

  private buildImports(): string {
    const decoratorImports = ['Entity', 'Attr', 'toWaterlineModelDef'];
    
    const hasBelongsTo = this.associations.some(a => a.type === 'belongsTo');
    const hasHasMany = this.associations.some(a => a.type === 'hasMany');
    
    if (hasBelongsTo) decoratorImports.push('BelongsTo');
    if (hasHasMany) decoratorImports.push('HasMany');

    return `import { ${decoratorImports.join(', ')} } from '../decorators';`;
  }

  private buildDecorators(): string {
    const lines: string[] = [];

    // Build attribute decorators
    for (const attr of this.attributes) {
      const opts = this.buildAttributeOptions(attr);
      lines.push(`  @Attr(${opts})`);
      lines.push(`  public ${attr.name}${attr.required ? '!' : '?'}: ${this.tsType(attr.type)};`);
      lines.push('');
    }

    // Build association decorators
    for (const assoc of this.associations) {
      if (assoc.type === 'belongsTo') {
        lines.push(`  @BelongsTo('${assoc.model}')`);
        lines.push(`  public ${assoc.name}?: string | number;`);
      } else if (assoc.type === 'hasMany') {
        if (!assoc.via) {
          throw new Error(`Missing 'via' for hasMany association '${assoc.name}'.`);
        }
        const opts = assoc.dominant ? `, { dominant: ${assoc.dominant} }` : '';
        lines.push(`  @HasMany('${assoc.model}', '${assoc.via}'${opts})`);
        lines.push(`  public ${assoc.name}?: unknown[];`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private buildProperties(): string {
    // For now, decorators include properties; this can be extended later
    return '';
  }

  private buildAttributeOptions(attr: ModelAttribute): string {
    const opts: string[] = [];
    
    opts.push(`type: '${attr.type === 'ref' ? 'ref' : attr.type}'`);
    
    if (attr.required) opts.push('required: true');
    if (attr.unique) opts.push('unique: true');
    if (attr.columnType) opts.push(`columnType: '${attr.columnType}'`);
    if (attr.defaultsTo !== undefined) {
      const val = this.formatDefaultValue(attr.defaultsTo);
      opts.push(`defaultsTo: ${val}`);
    }

    return `{ ${opts.join(', ')} }`;
  }

  private formatDefaultValue(value: ModelAttribute['defaultsTo']): string {
    if (value === null) {
      return 'null';
    }
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  private tsType(waterlineType: string): string {
    switch (waterlineType) {
      case 'string': return 'string';
      case 'number': return 'number';
      case 'boolean': return 'boolean';
      case 'json': return 'Record<string, unknown>';
      case 'ref': return 'unknown';
      default: return 'unknown';
    }
  }

  private buildAttributesInterface(): string {
    const lines: string[] = [];

    for (const attr of this.attributes) {
      const optional = attr.required ? '' : '?';
      lines.push(`  ${attr.name}${optional}: ${this.tsType(attr.type)};`);
    }

    for (const assoc of this.associations) {
      if (assoc.type === 'belongsTo') {
        lines.push(`  ${assoc.name}?: string | number;`);
      } else if (assoc.type === 'hasMany') {
        lines.push(`  ${assoc.name}?: unknown[];`);
      }
    }

    return lines.join('\n');
  }
}
