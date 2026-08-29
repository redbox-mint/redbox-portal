import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Config } from '../../src/config';
import { auth } from '../../src/config/auth.config';
import { routes } from '../../src/config/routes.config';
import { ControllerExports, ControllerNames } from '../../src/controllers';
import { generateConfigShims, generateControllerShims } from '../../src/loader';

const legacyControllerName = ['Action', 'Controller'].join('');
const legacyConfigName = ['act', 'ion'].join('');
const legacyPath = `/:branding/:portal/${legacyConfigName}/:${legacyConfigName}`;
const repositoryRoot = path.resolve(__dirname, '../../../..');

describe('Legacy action surface removal', () => {
  it('leaves the former POST route unregistered so requests return not found', () => {
    expect(routes).not.to.have.property(`post ${legacyPath}`);
    expect(Object.values(routes)).not.to.include(`${legacyControllerName}.callService`);
    expect(auth.rules.some(rule => rule.path === legacyPath)).to.equal(false);
  });

  it('does not export the controller or its configuration contract', () => {
    expect(ControllerNames).not.to.include(legacyControllerName);
    expect(ControllerExports).not.to.have.own.property(legacyControllerName);
    expect(Config).not.to.have.own.property(legacyConfigName);
  });

  it('does not emit controller or configuration declarations', async () => {
    const packageRoot = path.resolve(__dirname, '../..');
    await expectMissing(path.join(packageRoot, 'dist', 'controllers', `${legacyControllerName}.d.ts`));
    await expectMissing(path.join(packageRoot, 'dist', 'config', `${legacyConfigName}.config.d.ts`));

    const [controllerIndex, configIndex] = await Promise.all([
      fs.promises.readFile(path.join(packageRoot, 'dist', 'controllers', 'index.d.ts'), 'utf8'),
      fs.promises.readFile(path.join(packageRoot, 'dist', 'config', 'index.d.ts'), 'utf8'),
    ]);
    expect(controllerIndex).not.to.include(legacyControllerName);
    expect(configIndex).not.to.include(`./${legacyConfigName}.config`);
  });

  it('does not generate controller or configuration shims for the removed surface', async () => {
    const sandboxDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'redbox-legacy-action-'));
    const controllersDir = path.join(sandboxDir, 'api', 'controllers');
    const configDir = path.join(sandboxDir, 'config');

    try {
      await Promise.all([
        fs.promises.mkdir(controllersDir, { recursive: true }),
        fs.promises.mkdir(configDir, { recursive: true }),
      ]);
      await Promise.all([generateControllerShims(controllersDir, {}, {}), generateConfigShims(configDir, [])]);

      await expectMissing(path.join(controllersDir, `${legacyControllerName}.js`));
      await expectMissing(path.join(configDir, `${legacyConfigName}.js`));
    } finally {
      await fs.promises.rm(sandboxDir, { recursive: true, force: true });
    }
  });

  it('has no shipped Angular, EJS, test, or hook consumers', async () => {
    const packageDirs = await fs.promises.readdir(path.join(repositoryRoot, 'packages'), { withFileTypes: true });
    const consumerRoots = [
      path.join(repositoryRoot, 'angular', 'projects'),
      path.join(repositoryRoot, 'views'),
      path.join(repositoryRoot, 'test'),
      path.join(repositoryRoot, 'typescript'),
      ...packageDirs
        .filter(entry => entry.isDirectory())
        .flatMap(entry => [
          path.join(repositoryRoot, 'packages', entry.name, 'src'),
          path.join(repositoryRoot, 'packages', entry.name, 'test'),
          path.join(repositoryRoot, 'packages', entry.name, 'templates'),
        ]),
    ].filter(root => fs.existsSync(root));

    const forbiddenConsumers = await findForbiddenConsumers(consumerRoots);
    expect(forbiddenConsumers).to.deep.equal([]);
  });
});

async function expectMissing(filePath: string): Promise<void> {
  const exists = await fs.promises.access(filePath).then(
    () => true,
    () => false
  );
  expect(exists, filePath).to.equal(false);
}

async function findForbiddenConsumers(roots: readonly string[]): Promise<string[]> {
  const violations: string[] = [];
  const sourceExtensions = new Set(['.bru', '.ejs', '.hbs', '.html', '.js', '.ts']);
  const legacyConfigAccess = new RegExp(`sails\\.config\\.${legacyConfigName}(?:\\.|\\[)`);

  async function inspect(directory: string): Promise<void> {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'dist' && entry.name !== 'node_modules') {
            await inspect(entryPath);
          }
          return;
        }
        if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) {
          return;
        }

        const source = await fs.promises.readFile(entryPath, 'utf8');
        if (
          source.includes(legacyControllerName) ||
          source.includes(`/${legacyConfigName}/`) ||
          legacyConfigAccess.test(source)
        ) {
          violations.push(path.relative(repositoryRoot, entryPath));
        }
      })
    );
  }

  await Promise.all(roots.map(inspect));
  return violations.sort();
}
