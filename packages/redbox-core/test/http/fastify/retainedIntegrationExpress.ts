import type { Router, RequestHandler } from 'express';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import * as vocabularyAdministration from '../../../src/http/express/vocabularyAdministration';
import * as vocabularyIntegrations from '../../../src/http/express/vocabularyIntegrations';
import * as brandingOperations from '../../../src/http/express/brandingOperations';
import * as figshareAdministration from '../../../src/http/express/figshareAdministration';
import * as formVocabulary from '../../../src/http/express/formVocabulary';
import * as integrationOperations from '../../../src/http/express/integrationOperations';

/** Insert test middleware at the real registered action boundary. Production
 * declarations, ordered policies, CSRF and original action handlers are retained. */
function decorateMount<Input>(mount: (router: Router, input: Input) => void, beforeAction?: RequestHandler) {
  return (router: Router, input: Input) => {
    const boundary = beforeAction
      ? new Proxy(router, {
          get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver);
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(String(key))) return value;
            return (...args: unknown[]) => {
              args.splice(args.length - 1, 0, beforeAction);
              return Reflect.apply(value, target, args);
            };
          },
        })
      : router;
    mount(boundary, input);
  };
}
/** Equivalent boundary for the extracted Express host, without substituting actions. */
export function integrationExpressActionHook(beforeAction: RequestHandler) {
  const mounts = {
    vocabularyAdministration: vocabularyAdministration.mountVocabularyAdministrationRoutes,
    vocabularyIntegrations: vocabularyIntegrations.mountVocabularyIntegrationRoutes,
    brandingOperations: brandingOperations.mountBrandingOperationRoutes,
    figshareAdministration: figshareAdministration.mountFigshareAdministrationRoutes,
    formVocabulary: formVocabulary.mountFormVocabularyRoutes,
    integrationOperations: integrationOperations.mountIntegrationOperationRoutes,
  };
  const stubs = [
    sinon
      .stub(vocabularyAdministration, 'mountVocabularyAdministrationRoutes')
      .callsFake(decorateMount(mounts.vocabularyAdministration, beforeAction)),
    sinon
      .stub(vocabularyIntegrations, 'mountVocabularyIntegrationRoutes')
      .callsFake(decorateMount(mounts.vocabularyIntegrations, beforeAction)),
    sinon
      .stub(brandingOperations, 'mountBrandingOperationRoutes')
      .callsFake(decorateMount(mounts.brandingOperations, beforeAction)),
    sinon
      .stub(figshareAdministration, 'mountFigshareAdministrationRoutes')
      .callsFake(decorateMount(mounts.figshareAdministration, beforeAction)),
    sinon
      .stub(formVocabulary, 'mountFormVocabularyRoutes')
      .callsFake(decorateMount(mounts.formVocabulary, beforeAction)),
    sinon
      .stub(integrationOperations, 'mountIntegrationOperationRoutes')
      .callsFake(decorateMount(mounts.integrationOperations, beforeAction)),
  ];
  return () => stubs.forEach(stub => stub.restore());
}
/** Immutable pre-extraction production adapters, installed only while the preceding
 * production PortalHttp prepares its own registrations. No test dispatch table. */
export async function retainedIntegrationExpress(beforeAction?: RequestHandler) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm027-express-reference-'));
  const root = path.resolve(__dirname, '../../../../..');
  const revision = '4648979be';
  const hashes: Record<string, string> = {};
  try {
    for (const name of [
      'vocabularyAdministration',
      'vocabularyIntegrations',
      'brandingOperations',
      'figshareAdministration',
      'integrationOperations',
      'formVocabulary',
    ]) {
      const relative = 'packages/redbox-core/src/' + 'http/express/' + name + '.ts';
      const source = execFileSync('git', ['show', revision + ':' + relative], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
      });
      hashes[name] = createHash('sha256').update(source).digest('hex');
      const relocated = source.replace(
        /(['"])(\.\.?\/[^'"]+)\1/g,
        (_match, quote, specifier) => quote + path.resolve(root, path.dirname(relative), specifier) + quote
      );
      const sourceRequire = createRequire(path.join(root, relative));
      const output = ts
        .transpileModule(relocated, {
          compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        })
        .outputText.replace(
          /require\((['"])([^'"]+)\1\)/g,
          (_match, quote, specifier) => 'require(' + quote + sourceRequire.resolve(specifier) + quote + ')'
        );
      await writeFile(path.join(directory, name + '.js'), output);
    }
    return {
      hashes,
      close: () => rm(directory, { recursive: true, force: true }),
      install: () => {
        const stubs = [
          sinon
            .stub(formVocabulary, 'mountFormVocabularyRoutes')
            .callsFake(
              decorateMount(require(path.join(directory, 'formVocabulary.js')).mountFormVocabularyRoutes, beforeAction)
            ),
          sinon
            .stub(vocabularyAdministration, 'mountVocabularyAdministrationRoutes')
            .callsFake(
              decorateMount(
                require(path.join(directory, 'vocabularyAdministration.js')).mountVocabularyAdministrationRoutes,
                beforeAction
              )
            ),
          sinon
            .stub(vocabularyIntegrations, 'mountVocabularyIntegrationRoutes')
            .callsFake(
              decorateMount(
                require(path.join(directory, 'vocabularyIntegrations.js')).mountVocabularyIntegrationRoutes,
                beforeAction
              )
            ),
          sinon
            .stub(brandingOperations, 'mountBrandingOperationRoutes')
            .callsFake(
              decorateMount(
                require(path.join(directory, 'brandingOperations.js')).mountBrandingOperationRoutes,
                beforeAction
              )
            ),
          sinon
            .stub(figshareAdministration, 'mountFigshareAdministrationRoutes')
            .callsFake(
              decorateMount(
                require(path.join(directory, 'figshareAdministration.js')).mountFigshareAdministrationRoutes,
                beforeAction
              )
            ),
          sinon
            .stub(integrationOperations, 'mountIntegrationOperationRoutes')
            .callsFake(
              decorateMount(
                require(path.join(directory, 'integrationOperations.js')).mountIntegrationOperationRoutes,
                beforeAction
              )
            ),
        ];
        return () => {
          try {
            for (const stub of stubs)
              assert.equal(stub.callCount, 1, 'Retained production mount must run exactly once');
          } finally {
            stubs.forEach(stub => stub.restore());
          }
        };
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
