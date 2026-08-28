import assert from 'node:assert/strict';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
  parseActionContext,
  type ActionContext,
} from '../src/action-registry';
import { parseActionBindingId } from '../src/action-registry/identifiers';
import { ActionTimeoutFailure, normalizeActionFailure } from '../src/action-execution';
import {
  EXPRESSION_RUNTIME_LIMITS,
  MANAGED_HANDLEBARS_HELPER_NAMES,
  MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES,
  ManagedExpressionError,
  compileManagedHandlebarsTemplate,
  compileManagedJsonataExpression,
  evaluateManagedCondition,
  evaluateManagedJsonata,
  projectActionParameterContext,
  projectOutputDependencyContext,
  projectTextTemplateContext,
  projectTransitionConditionContext,
  renderManagedHandlebars,
  type ManagedJsonataValueContext,
} from '../src/expression-runtime';
import { ExpressionRuntime } from '../src';

const priorBindingId = parseActionBindingId('actb_00000000000000000000000000000000');

function context(): ActionContext {
  return parseActionContext({
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId: 'execution-1',
    correlationId: 'correlation-1',
    requestId: 'request-1',
    timestamp: '2026-08-27T01:02:03Z',
    brandId: 'default',
    recordTypeKey: 'rdmp',
    scope: {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: 'approve',
    },
    actor: { id: 'user-1', username: 'ada', roles: ['Admin'] },
    record: {
      oid: 'record-1',
      current: { metadata: { title: 'Old' } },
      candidate: {
        metadata: {
          title: '<Ada & Bob>',
          nested: { accepted: true, secretToken: 'context-secret' },
          serviceRegistry: { mail: 'must-not-project' },
          request: { headers: 'must-not-project' },
          httpRequest: { headers: 'must-not-project' },
          apiResponse: { body: 'must-not-project' },
          processEnv: { API_KEY: 'must-not-project' },
          apiKey: 'must-not-project',
        },
      },
    },
    transition: { scopeId: 'approve', sourceStage: 'draft', targetStage: 'review' },
    priorOutputs: [
      {
        bindingId: priorBindingId,
        output: {
          schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
          fields: { approved: true, publicLabel: 'safe', secretValue: 'must-not-project' },
        },
      },
    ],
  });
}

async function capturedError(operation: Promise<never>): Promise<ManagedExpressionError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ManagedExpressionError) {
      return error;
    }
    throw error;
  }
  assert.fail('Expected managed expression execution to fail.');
}

describe('managed JSONata and Handlebars runtime', function () {
  this.timeout(15_000);

  it('exports a fixed managed contract without eval-like JSONata functions or unsafe Handlebars helpers', () => {
    assert.equal(ExpressionRuntime.compileManagedJsonataExpression, compileManagedJsonataExpression);
    assert.deepEqual(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES, ['guessNameParts', 'luxonFormatDate']);
    assert.equal(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES.includes('eval'), false);
    assert.equal(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES.includes('jsonata'), false);
    for (const helper of ['get', 'lookup', 't', 'markdownToHtml', 'renderMetadataValue']) {
      assert.equal(MANAGED_HANDLEBARS_HELPER_NAMES.includes(helper), false);
    }
    assert.equal(Object.isFrozen(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES), true);
    assert.equal(Object.isFrozen(MANAGED_HANDLEBARS_HELPER_NAMES), true);
  });

  it('creates frozen purpose-specific projections and omits server-internal and secret-bearing keys', () => {
    const source = context();
    const transition = projectTransitionConditionContext(source);
    const parameters = projectActionParameterContext(source);
    const template = projectTextTemplateContext(source);
    const output = projectOutputDependencyContext(source, priorBindingId, ['approved', 'publicLabel']);

    assert.equal(transition.purpose, 'transition-condition');
    assert.equal(parameters.purpose, 'action-parameter');
    assert.equal(template.purpose, 'text-template');
    assert.equal(output.purpose, 'output-dependency');
    assert.deepEqual(output.priorOutput.fields, { approved: true, publicLabel: 'safe' });
    assert.deepEqual(projectOutputDependencyContext(source, priorBindingId, ['toString']).priorOutput.fields, {});
    assert.equal(JSON.stringify([transition, parameters, template, output]).includes('context-secret'), false);
    assert.equal(JSON.stringify([transition, parameters, template, output]).includes('must-not-project'), false);
    assert.equal('requestId' in parameters, false);
    assert.equal(Object.isFrozen(parameters), true);
    assert.equal(Object.isFrozen(parameters.record.candidate?.metadata), true);
    assert.equal(Object.isFrozen(parameters.actor?.roles), true);
  });

  it('rejects tampered artifacts and engine-incompatible context purposes at runtime', async () => {
    const prepared = compileManagedJsonataExpression('record.candidate.metadata.title');
    const artifactFailure = await capturedError(
      evaluateManagedJsonata(
        { ...prepared, astNodes: prepared.astNodes + 1 } as any,
        projectActionParameterContext(context()),
        { timeoutMs: 1_000 }
      ) as Promise<never>
    );
    assert.equal(artifactFailure.diagnostic.code, 'jsonata-artifact-invalid');
    assert.equal(artifactFailure.diagnostic.workerTerminated, false);

    const contextFailure = await capturedError(
      renderManagedHandlebars(
        compileManagedHandlebarsTemplate('{{record.oid}}', 'plain-text'),
        projectActionParameterContext(context()) as any,
        { timeoutMs: 1_000 }
      ) as Promise<never>
    );
    assert.equal(contextFailure.diagnostic.engine, 'handlebars');
    assert.equal(contextFailure.diagnostic.code, 'expression-worker-request-invalid');
  });

  it('rejects forbidden JSONata bindings and prototype/property escape attempts at compilation', () => {
    for (const source of [
      '$eval("1 + 1")',
      '$jsonata("1 + 1")',
      '$lookup(record, "title")',
      'record.candidate.constructor',
      'record.candidate."__proto__"',
      '$exists($process)',
    ]) {
      assert.throws(() => compileManagedJsonataExpression(source), ManagedExpressionError);
    }
    assert.doesNotThrow(() => compileManagedJsonataExpression('"Request approved without a secret value"'));
  });

  it('rejects forbidden Handlebars helpers, extensions, unescaped output, and prototype paths', () => {
    for (const source of [
      '{{get record "candidate.metadata.title"}}',
      '{{lookup record "constructor"}}',
      '{{t "secret.key"}}',
      '{{record.constructor}}',
      '{{{record.candidate.metadata.title}}}',
      '{{> persistedPartial}}',
    ]) {
      assert.throws(() => compileManagedHandlebarsTemplate(source, 'html-text'), ManagedExpressionError);
    }
  });

  it('enforces source, AST complexity, and template iteration limits deterministically', () => {
    assert.throws(
      () => compileManagedJsonataExpression('x'.repeat(EXPRESSION_RUNTIME_LIMITS.maxExpressionLength + 1)),
      ManagedExpressionError
    );
    assert.throws(
      () => compileManagedHandlebarsTemplate('x'.repeat(EXPRESSION_RUNTIME_LIMITS.maxTemplateLength + 1), 'plain-text'),
      ManagedExpressionError
    );
    const excessiveAst = `[${Array.from({ length: EXPRESSION_RUNTIME_LIMITS.maxAstNodes }, () => '1').join(',')}]`;
    assert.throws(() => compileManagedJsonataExpression(excessiveAst), ManagedExpressionError);
    const excessiveDepth = `${'$not('.repeat(EXPRESSION_RUNTIME_LIMITS.maxAstDepth + 1)}true${')'.repeat(
      EXPRESSION_RUNTIME_LIMITS.maxAstDepth + 1
    )}`;
    assert.throws(() => compileManagedJsonataExpression(excessiveDepth), ManagedExpressionError);
    const excessiveIterations = `${'{{#each record}}'.repeat(
      EXPRESSION_RUNTIME_LIMITS.maxTemplateEachBlocks + 1
    )}${'{{/each}}'.repeat(EXPRESSION_RUNTIME_LIMITS.maxTemplateEachBlocks + 1)}`;
    assert.throws(() => compileManagedHandlebarsTemplate(excessiveIterations, 'plain-text'), ManagedExpressionError);
  });

  it('evaluates JSONata only over projected JSON and enforces bounded inputs and results', async () => {
    const projected = projectActionParameterContext(context());
    const title = await evaluateManagedJsonata(
      compileManagedJsonataExpression('record.candidate.metadata.title'),
      projected,
      { timeoutMs: 1_000 }
    );
    assert.equal(title, '<Ada & Bob>');
    assert.equal(
      await evaluateManagedCondition(
        compileManagedJsonataExpression('record.candidate.metadata.nested.accepted = true'),
        projected,
        { timeoutMs: 1_000 }
      ),
      true
    );

    let nested: object = {};
    for (let depth = 0; depth < EXPRESSION_RUNTIME_LIMITS.maxJsonDepth + 10; depth += 1) {
      nested = { nested };
    }
    const deepContext = {
      ...projected,
      record: { candidate: nested },
    } as any as ManagedJsonataValueContext;
    const deepFailure = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('record'), deepContext, {
        timeoutMs: 1_000,
      }) as Promise<never>
    );
    assert.equal(deepFailure.diagnostic.kind, 'limit');
    assert.equal(deepFailure.diagnostic.code, 'expression-input-limit-exceeded');

    const resultFailure = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('$join([1..20000].$string(), "")'), projected, {
        timeoutMs: 1_000,
      }) as Promise<never>
    );
    assert.equal(resultFailure.diagnostic.kind, 'limit');
    assert.equal(resultFailure.diagnostic.code, 'jsonata-result-invalid');

    let accessorInvoked = false;
    const accessorContext = { ...projected };
    Object.defineProperty(accessorContext, 'record', {
      enumerable: true,
      get: () => {
        accessorInvoked = true;
        return {};
      },
    });
    const accessorFailure = await capturedError(
      evaluateManagedJsonata(
        compileManagedJsonataExpression('record'),
        accessorContext as any as ManagedJsonataValueContext,
        { timeoutMs: 1_000 }
      ) as Promise<never>
    );
    assert.equal(accessorFailure.diagnostic.code, 'expression-input-limit-exceeded');
    assert.equal(accessorInvoked, false);
  });

  it('uses destination-appropriate Handlebars escaping and only fixed pure helpers', async () => {
    const projected = projectTextTemplateContext(context());
    const source = '<strong>{{toUpper record.candidate.metadata.title}}</strong>\r\nBcc: attacker@example.test';
    const html = await renderManagedHandlebars(compileManagedHandlebarsTemplate(source, 'html-text'), projected, {
      timeoutMs: 1_000,
    });
    const plain = await renderManagedHandlebars(compileManagedHandlebarsTemplate(source, 'plain-text'), projected, {
      timeoutMs: 1_000,
    });
    const subject = await renderManagedHandlebars(
      compileManagedHandlebarsTemplate(source, 'email-subject'),
      projected,
      { timeoutMs: 1_000 }
    );
    const url = await renderManagedHandlebars(
      compileManagedHandlebarsTemplate('{{record.candidate.metadata.title}}', 'url-component'),
      projected,
      { timeoutMs: 1_000 }
    );

    assert.equal(html, '&lt;strong&gt;&lt;ADA &amp; BOB&gt;&lt;/strong&gt;\r\nBcc: attacker@example.test');
    assert.equal(plain, '<strong><ADA & BOB></strong>\r\nBcc: attacker@example.test');
    assert.equal(subject, '<strong><ADA & BOB></strong> Bcc: attacker@example.test');
    assert.equal(url, '%3CAda%20%26%20Bob%3E');
  });

  it('interrupts recursively expensive work at the worker boundary and preserves timeout semantics', async () => {
    const projected = projectActionParameterContext(context());
    const recursive = compileManagedJsonataExpression('($loop := function($x){$loop($x)}; $loop(1))');
    const timedOut = await capturedError(
      evaluateManagedJsonata(recursive, projected, { timeoutMs: 25 }) as Promise<never>
    );
    assert.deepEqual(timedOut.diagnostic, {
      schemaVersion: 1,
      engine: 'jsonata',
      kind: 'timeout',
      code: 'jsonata-timeout',
      workerTerminated: true,
    });

    const controller = new AbortController();
    controller.abort();
    const interrupted = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('true'), projected, {
        timeoutMs: 1_000,
        signal: controller.signal,
      }) as Promise<never>
    );
    assert.equal(interrupted.diagnostic.kind, 'interrupted');
    assert.equal(interrupted.diagnostic.code, 'jsonata-interrupted');
    assert.equal(interrupted.diagnostic.workerTerminated, false);

    const activeController = new AbortController();
    const activeInterruption = evaluateManagedJsonata(recursive, projected, {
      timeoutMs: 1_000,
      signal: activeController.signal,
    }) as Promise<never>;
    setTimeout(() => activeController.abort(), 25);
    const activelyInterrupted = await capturedError(activeInterruption);
    assert.equal(activelyInterrupted.diagnostic.kind, 'interrupted');
    assert.equal(activelyInterrupted.diagnostic.code, 'jsonata-interrupted');
    assert.equal(activelyInterrupted.diagnostic.workerTerminated, true);

    const ordinaryTimeout = normalizeActionFailure(new ActionTimeoutFailure(false));
    assert.equal(ordinaryTimeout.kind, 'timeout');
    assert.equal(ordinaryTimeout.cancellationCooperative, false);
    assert.notEqual(ordinaryTimeout.kind, 'interrupted');
  });

  it('returns only bounded redacted diagnostics for hostile source and context values', async () => {
    const projected = projectActionParameterContext(context());
    const failure = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('$sqrt("administrator-source-value")'), projected, {
        timeoutMs: 1_000,
      }) as Promise<never>
    );
    const serialized = JSON.stringify(failure.diagnostic);
    assert.equal(serialized.includes('administrator-source-value'), false);
    assert.equal(serialized.includes('context-secret'), false);
    assert.equal(serialized.length < 256, true);
    assert.equal(failure.message.includes('secret'), false);
  });
});
