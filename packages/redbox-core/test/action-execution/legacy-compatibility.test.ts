import { Effect } from 'effect';
import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import { Observable, of } from 'rxjs';
import ts from 'typescript';
import { createActionExecutionOperation } from '../../src/action-execution/index';
import { RecordHookCoordinator } from '../../src/services/record-hooks/coordinator';

type AnyRecord = Record<string, unknown>;

function forbiddenTypeKeywords(sourceFile: ts.SourceFile): readonly string[] {
  const failures: string[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      failures.push(
        `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}:${node.getText(sourceFile)}`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return failures;
}

function coordinator(
  recordType: AnyRecord,
  resolveHook: (hook: AnyRecord) => (...args: unknown[]) => unknown,
  logger?: {
    debug?: (...args: any[]) => void;
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  }
) {
  return new RecordHookCoordinator({
    operation: createActionExecutionOperation('onCreate'),
    dependencies: { logger },
    resolveHook: hook => resolveHook(hook as AnyRecord),
  });
}

function tick(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('record-hook legacy compatibility characterization', function () {
  it('keeps coordinator runtime and public declaration types free of broad escape hatches', function () {
    const sourcePath = path.resolve(__dirname, '../../src/services/record-hooks/coordinator.ts');
    const sourceText = fs.readFileSync(sourcePath, 'utf8');
    const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.ES2024, true, ts.ScriptKind.TS);
    const declaration = ts.transpileDeclaration(sourceText, {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2024,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        declaration: true,
        declarationMap: false,
        stripInternal: true,
      },
    });
    const diagnostics = declaration.diagnostics ?? [];
    expect(
      diagnostics,
      ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: name => name,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => '\n',
      })
    ).to.deep.equal([]);
    const declarationFile = ts.createSourceFile(
      sourcePath.replace(/\.ts$/, '.d.ts'),
      declaration.outputText,
      ts.ScriptTarget.ES2024,
      true,
      ts.ScriptKind.TS
    );

    expect([...forbiddenTypeKeywords(sourceFile), ...forbiddenTypeKeywords(declarationFile)]).to.deep.equal([]);
    expect(sourceText.match(/\b(?:any|unknown)\b/g) ?? []).to.deep.equal([]);
    expect(declaration.outputText.match(/\b(?:any|unknown)\b/g) ?? []).to.deep.equal([]);
  });

  it('preserves plain, Promise, Observable, and native Effect pre-hook values', async function () {
    const values = await Promise.all([
      coordinator({ hooks: { onCreate: { pre: [{ function: 'plain' }] } } }, () => () => 'plain').runPre(
        null,
        {},
        { hooks: { onCreate: { pre: [{ function: 'plain' }] } } },
        'onCreate',
        {}
      ),
      coordinator(
        { hooks: { onCreate: { pre: [{ function: 'promise' }] } } },
        () => () => Promise.resolve('promise')
      ).runPre(null, {}, { hooks: { onCreate: { pre: [{ function: 'promise' }] } } }, 'onCreate', {}),
      coordinator({ hooks: { onCreate: { pre: [{ function: 'observable' }] } } }, () => () => of('observable')).runPre(
        null,
        {},
        { hooks: { onCreate: { pre: [{ function: 'observable' }] } } },
        'onCreate',
        {}
      ),
      coordinator(
        { hooks: { onCreate: { pre: [{ function: 'effect' }] } } },
        () => () => Effect.succeed('effect')
      ).runPre(null, {}, { hooks: { onCreate: { pre: [{ function: 'effect' }] } } }, 'onCreate', {}),
    ]);

    expect(values.map(result => result.record)).to.deep.equal(['plain', 'promise', 'observable', 'effect']);
  });

  it('preserves sequential record threading and fail-fast omission', async function () {
    const invoked: string[] = [];
    const recordType = {
      hooks: {
        onCreate: {
          pre: [{ function: 'first' }, { function: 'second' }, { function: 'never' }],
        },
      },
    };
    const result = await coordinator(recordType, hook => {
      const name = String(hook.function);
      return (_oid, record) => {
        invoked.push(name);
        if (name === 'second') {
          throw new Error('legacy stop');
        }
        return { ...(record as AnyRecord), first: true };
      };
    }).runPre('oid-1', { initial: true }, recordType, 'onCreate', { username: 'user' });

    expect(invoked).to.deep.equal(['first', 'second']);
    expect(result.record).to.deep.equal({ initial: true, first: true });
    expect(result.report.actions.map(action => action.status)).to.deep.equal(['succeeded', 'failed', 'skipped']);
  });

  it('locks the postSync record-return and in-place response mutation quirk', async function () {
    const recordType = {
      hooks: {
        onCreate: {
          postSync: [
            { function: 'record', options: { returnType: 'record' } },
            { function: 'response', options: { returnType: 'response' } },
          ],
        },
      },
    };
    const seen: AnyRecord[] = [];
    const result = await coordinator(recordType, hook => {
      if (hook.function === 'record') {
        return (_oid, record, _options, _user, response) => {
          seen.push({ record: record as AnyRecord, response: response as AnyRecord });
          (response as AnyRecord).workspaceOid = 'workspace-1';
          return { ...(record as AnyRecord), transformed: true };
        };
      }
      return (_oid, record, _options, _user, response) => {
        seen.push({ record: record as AnyRecord, response: response as AnyRecord });
        (response as AnyRecord).workspaceData = { linked: true };
        return {
          success: false,
          message: 'legacy response',
          data: { accepted: true },
          metadata: { warning: true },
          oid: 'must-not-replace',
          secret: 'must-not-leak',
        };
      };
    }).runPostSync('oid-1', { original: true }, recordType, 'onCreate', {}, { oid: 'oid-1', success: true });

    expect(result.record).to.deep.equal({ original: true, transformed: true });
    expect(seen[1].record).to.deep.equal({ original: true, transformed: true });
    expect(result.response).to.deep.include({
      oid: 'oid-1',
      success: false,
      message: 'legacy response',
      data: { accepted: true },
      metadata: { warning: true },
      workspaceOid: 'workspace-1',
      workspaceData: { linked: true },
    });
    expect(result.response).not.to.have.property('secret');
  });

  it('preserves detached invocation order, overlap, ignored returns, and swallowed failures', async function () {
    const invoked: string[] = [];
    const completed: string[] = [];
    const errors: unknown[] = [];
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const recordType = {
      hooks: {
        onCreate: {
          post: [{ function: 'first' }, { function: 'second' }, { function: 'failure' }],
        },
      },
    };
    const result = coordinator(
      recordType,
      hook => {
        if (hook.function === 'first') {
          return () => {
            invoked.push('first');
            return new Promise<void>(resolve => {
              resolveFirst = () => {
                completed.push('first');
                resolve();
              };
            });
          };
        }
        if (hook.function === 'second') {
          return () => {
            invoked.push('second');
            return new Promise<void>(resolve => {
              resolveSecond = () => {
                completed.push('second');
                resolve();
              };
            });
          };
        }
        return () => {
          invoked.push('failure');
          throw new Error('detached failure');
        };
      },
      { error: (_message, error) => errors.push(error) }
    ).dispatchPost('oid-1', { value: true }, recordType, 'onCreate', { username: 'user' });

    expect(result.report.status).to.equal('dispatched');
    await tick();
    expect(invoked).to.deep.equal(['first', 'second', 'failure']);
    resolveSecond();
    resolveFirst();
    await tick();
    expect(completed).to.deep.equal(['second', 'first']);
    expect(errors).to.have.length(1);
  });

  it('skips one malformed detached definition and still dispatches later hooks', async function () {
    const invoked: string[] = [];
    const warnings: unknown[] = [];
    const recordType = {
      hooks: {
        onCreate: {
          post: [{ function: '' }, { function: 'valid' }],
        },
      },
    };
    const result = coordinator(
      recordType,
      hook => () => {
        invoked.push(String(hook.function));
        return undefined;
      },
      { warn: (_message, fields) => warnings.push(fields) }
    ).dispatchPost('oid-1', {}, recordType, 'onCreate', {});

    await tick();
    expect(result.report.actions.map(action => action.actionId)).to.have.length(1);
    expect(invoked).to.deep.equal(['valid']);
    expect(warnings).to.have.length(1);
  });

  it('captures Observable failure and synchronous detached throws without leaking the cause', async function () {
    const errors: Array<Record<string, unknown>> = [];
    const recordType = {
      hooks: {
        onCreate: {
          post: [{ function: 'observable' }, { function: 'throw' }],
        },
      },
    };
    coordinator(
      recordType,
      hook => () =>
        hook.function === 'observable'
          ? new Observable(subscriber => subscriber.error({ secret: 'do-not-log' }))
          : (() => {
              throw new Error('secret throw');
            })(),
      {
        error: (_message, fields) => errors.push(fields as Record<string, unknown>),
      }
    ).dispatchPost('oid-1', {}, recordType, 'onCreate', {});
    await tick();

    expect(errors).to.have.length(2);
    expect(JSON.stringify(errors)).not.to.include('secret');
  });
});
