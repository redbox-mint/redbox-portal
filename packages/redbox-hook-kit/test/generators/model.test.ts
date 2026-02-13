import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ModelGenerator } from '../../src/generators/model';
import { resolvePaths } from '../../src/utils/paths';

describe('ModelGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core-types');
    
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'waterline-models'), { recursive: true });
    
    // Create mock index.ts
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'waterline-models', 'index.ts'), `
export * from './User';

import { UserWLDef } from './User';

export const WaterlineModels = {
  User: UserWLDef,
};
`);

    // Create mock types.ts
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'waterline-models', 'types.ts'), `
export type JsonMap = { [key: string]: unknown };
`);

    // Create mock sails.ts
    fs.mkdirSync(path.join(coreTypesRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'sails.ts'), `
declare namespace Sails {
  interface WaterlineAttributes {}
  interface Model<T> {}
}
`);

    // Create mock decorators directory and index
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'decorators'), { recursive: true });
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'decorators', 'index.ts'), `
export function Entity(identity: string) { return (target: any) => {}; }
export function Attr(opts: any) { return (target: any, key: string) => {}; }
export function BelongsTo(model: string) { return (target: any, key: string) => {}; }
export function HasMany(collection: string, via: string, opts?: any) { return (target: any, key: string) => {}; }
export function toWaterlineModelDef(cls: any) { return {}; }
`);

    // Create a mock package.json so resolvePaths is happy
    fs.writeFileSync(path.join(coreTypesRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should generate a simple model with attributes', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ModelGenerator({
      name: 'Product',
      attributes: [
        { name: 'name', type: 'string', required: true },
        { name: 'price', type: 'number', required: true },
        { name: 'description', type: 'string' },
        { name: 'metadata', type: 'json' }
      ],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const modelPath = path.join(coreTypesRoot, 'src', 'waterline-models', 'Product.ts');
    expect(fs.existsSync(modelPath)).to.be.true;
    
    const content = fs.readFileSync(modelPath, 'utf-8');
    expect(content).to.contain("@Entity('product')");
    expect(content).to.contain('export class ProductClass');
    expect(content).to.contain("@Attr({ type: 'string', required: true })");
    expect(content).to.contain('public name!: string;');
    expect(content).to.contain("@Attr({ type: 'number', required: true })");
    expect(content).to.contain('public price!: number;');
    expect(content).to.contain("@Attr({ type: 'string' })");
    expect(content).to.contain('public description?: string;');
    expect(content).to.contain("@Attr({ type: 'json' })");
    expect(content).to.contain('public metadata?: Record<string, unknown>;');
    expect(content).to.contain('export const ProductWLDef = toWaterlineModelDef(ProductClass);');
    expect(content).to.contain('export interface ProductAttributes extends Sails.WaterlineAttributes');
  });

  it('should generate a model with belongsTo association', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ModelGenerator({
      name: 'Order',
      attributes: [
        { name: 'orderNumber', type: 'string', required: true, unique: true }
      ],
      associations: [
        { name: 'customer', type: 'belongsTo', model: 'user' }
      ],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const modelPath = path.join(coreTypesRoot, 'src', 'waterline-models', 'Order.ts');
    const content = fs.readFileSync(modelPath, 'utf-8');
    
    expect(content).to.contain("import { Entity, Attr, toWaterlineModelDef, BelongsTo }");
    expect(content).to.contain("@BelongsTo('user')");
    expect(content).to.contain('public customer?: string | number;');
  });

  it('should generate a model with hasMany association', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ModelGenerator({
      name: 'Category',
      attributes: [
        { name: 'name', type: 'string', required: true }
      ],
      associations: [
        { name: 'products', type: 'hasMany', model: 'product', via: 'category' }
      ],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const modelPath = path.join(coreTypesRoot, 'src', 'waterline-models', 'Category.ts');
    const content = fs.readFileSync(modelPath, 'utf-8');
    
    expect(content).to.contain("import { Entity, Attr, toWaterlineModelDef, HasMany }");
    expect(content).to.contain("@HasMany('product', 'category')");
    expect(content).to.contain('public products?: unknown[];');
  });

  it('should use custom identity when provided', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ModelGenerator({
      name: 'UserProfile',
      identity: 'user_profiles',
      attributes: [
        { name: 'bio', type: 'string' }
      ],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const modelPath = path.join(coreTypesRoot, 'src', 'waterline-models', 'UserProfile.ts');
    const content = fs.readFileSync(modelPath, 'utf-8');
    
    expect(content).to.contain("@Entity('user_profiles')");
  });

  it('should update the index file', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ModelGenerator({
      name: 'Setting',
      attributes: [
        { name: 'key', type: 'string', required: true, unique: true },
        { name: 'value', type: 'json' }
      ],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'waterline-models', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("export * from './Setting'");
    expect(indexContent).to.contain("import { SettingWLDef } from './Setting'");
    expect(indexContent).to.contain('Setting: SettingWLDef');
  });

  it('should generate attributes with column type', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ModelGenerator({
      name: 'Event',
      attributes: [
        { name: 'title', type: 'string', required: true },
        { name: 'startDate', type: 'string', columnType: 'datetime' }
      ],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const modelPath = path.join(coreTypesRoot, 'src', 'waterline-models', 'Event.ts');
    const content = fs.readFileSync(modelPath, 'utf-8');
    
    expect(content).to.contain("@Attr({ type: 'string', columnType: 'datetime' })");
    expect(content).to.contain('public startDate?: string;');
  });
});
