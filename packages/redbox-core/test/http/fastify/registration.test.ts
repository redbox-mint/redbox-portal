import assert from 'node:assert/strict';
import fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  applicationStatusController,
  bindControllerFactory,
  defineController,
  type ApplicationStatusControllerInput,
  type ControllerRegistration,
} from '@researchdatabox/redbox-core/http';
import { composeControllers } from '../../../dist/http/fastify/registration';

const target = { controller: 'Example', action: 'read' };
const registration = (factory: ControllerRegistration, provider = 'core') => ({ provider, declaration: factory });

/** Erased descriptors model JS/installed declarations, including invalid method names. */
function fixture(actions: readonly string[], create: () => object = () => ({ read() {} })) {
  const factory: ControllerRegistration = { name: 'Example', actions, create };
  const binding = Object.assign(create, { factory });
  return { factory, binding };
}

interface ReadInput {
  readonly prefix: string;
}
class BaseController {
  public constructor(protected readonly input: ReadInput) {}
  public read(request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply): unknown {
    return reply.send({ name: this.input.prefix + request.params.name });
  }
  public helper(): string {
    return this.input.prefix;
  }
}

describe('internal Fastify controller registration', () => {
  it('constructs the exported core controller with its concrete borrowed operations', async () => {
    let calls = 0;
    const status: ReturnType<ApplicationStatusControllerInput['application']['status']> = {
      state: 'initialized',
      ready: false,
      stopFailed: false,
      cleanupPending: false,
      persistence: { ready: true, cleanupPending: false, resources: [], operations: 0, prismaClients: 0, pools: 0 },
    };
    const input: ApplicationStatusControllerInput = {
      application: {
        status() {
          calls++;
          return status;
        },
      },
    };
    const coreTarget = { controller: applicationStatusController.name, action: 'status' };
    const composition = composeControllers(
      [registration(applicationStatusController)],
      [bindControllerFactory(applicationStatusController, input)],
      [coreTarget]
    );
    const result = composition.instantiate();
    assert.equal(calls, 0);
    const app = fastify();
    try {
      app.get('/status-fixture', result.action(coreTarget));
      assert.deepEqual((await app.inject('/status-fixture')).json(), status);
      assert.equal(calls, 1);
    } finally {
      await app.close();
    }
  });
  it('binds concrete inputs offline and exposes only declared actions on one selected instance', async () => {
    let creates = 0;
    const factory = defineController({
      name: 'Example',
      actions: ['read'],
      create(input: ReadInput) {
        creates++;
        return new BaseController(input);
      },
    });
    const binding = bindControllerFactory(factory, { prefix: 'Hello ' });
    const composition = composeControllers([registration(factory)], [binding], [target]);
    assert.equal(creates, 0);
    const resolved = composition.instantiate();
    assert.equal(composition.instantiate(), resolved);
    assert.equal(creates, 1);
    assert.equal(resolved.controllers.length, 1);
    assert.equal(resolved.action(target), resolved.action(target));
    assert.throws(() => resolved.action({ ...target, action: 'helper' }), /unlisted/);

    const app = fastify();
    try {
      app.get('/example/:name', resolved.action(target));
      const response = await app.inject('/example/Ada');
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { name: 'Hello Ada' });
      assert.equal((await app.inject('/helper')).statusCode, 404);
    } finally {
      await app.close();
    }
  });

  it('selects the final replacement before binding/constructing; losing factories never run', async () => {
    const losing = (): BaseController => {
      throw new Error('losing factory ran');
    };
    const first = defineController({ name: 'Example', actions: ['read'], requires: ['unused'], create: losing });
    const middle = defineController({ name: 'Example', actions: ['read'], replaces: true, create: losing });
    interface ExtendedInput extends ReadInput {
      readonly suffix: string;
    }
    class ReplacementController extends BaseController {
      public constructor(input: ExtendedInput) {
        super({ prefix: input.prefix + input.suffix });
      }
      // read is deliberately inherited and still uses the selected instance's `this`.
    }
    let creates = 0;
    const winner = defineController({
      name: 'Example',
      actions: ['read'],
      replaces: true,
      create(input: ExtendedInput) {
        creates++;
        return new ReplacementController(input);
      },
    });
    const composition = composeControllers(
      [registration(first), registration(middle, 'middle'), registration(winner, 'institution')],
      [
        bindControllerFactory(first, undefined),
        bindControllerFactory(middle, undefined),
        bindControllerFactory(winner, { prefix: 'institution', suffix: ': ' }),
      ],
      [target]
    );
    assert.equal(creates, 0);
    assert.equal(composition.controllers[0].provider, 'institution');
    const app = fastify();
    try {
      app.get('/:name', composition.instantiate().action(target));
      assert.deepEqual((await app.inject('/Ada')).json(), { name: 'institution: Ada' });
      composition.instantiate();
      assert.equal(creates, 1);
    } finally {
      await app.close();
    }
  });

  it('does not require bindings for losing factories and retains synchronous actions', async () => {
    const loser = fixture(['read'], () => {
      throw new Error('loser');
    });
    const winner = defineController({
      name: 'Example',
      replaces: true,
      actions: ['read'],
      create: (input: { value: number }) => ({
        read: (_request: FastifyRequest, reply: FastifyReply) => reply.send(input.value),
      }),
    });
    const result = composeControllers(
      [registration(loser.factory), registration(winner, 'hook')],
      [bindControllerFactory(winner, { value: 42 })],
      [target]
    ).instantiate();
    const app = fastify();
    try {
      app.get('/', result.action(target));
      assert.equal((await app.inject('/')).body, '42');
    } finally {
      await app.close();
    }
  });

  it('constructs separate instances for separate application compositions', () => {
    const factory = defineController({
      name: 'Example',
      actions: ['read'],
      create: (input: ReadInput) => new BaseController(input),
    });
    const make = (prefix: string) =>
      composeControllers([registration(factory)], [bindControllerFactory(factory, { prefix })], [target]).instantiate();
    assert.notEqual(make('first').controllers[0].instance, make('second').controllers[0].instance);
  });

  it('allows a deliberately empty exposure list without discovering callable helpers', () => {
    const { factory, binding } = fixture([], () => new BaseController({ prefix: 'private' }));
    const result = composeControllers([registration(factory)], [binding], []).instantiate();
    assert.equal(result.controllers[0].actions.size, 0);
    assert.throws(() => result.action(target), /unlisted/);
  });

  it('rejects missing controller targets offline', () => {
    assert.throws(() => composeControllers([], [], [target]), /missing controller Example/);
  });
  it('rejects unlisted targets offline without constructing a controller', () => {
    const { factory, binding } = fixture(['read'], () => {
      throw new Error('factory ran');
    });
    assert.throws(
      () => composeControllers([registration(factory)], [binding], [{ ...target, action: 'helper' }]),
      /unlisted/
    );
  });
  it('rejects missing bindings offline', () => {
    const { factory } = fixture(['read'], () => {
      throw new Error('factory ran');
    });
    assert.throws(() => composeControllers([registration(factory)], [], [target]), /missing controller binding/);
  });
  it('rejects unknown bindings offline', () => {
    const { binding } = fixture(['read'], () => {
      throw new Error('factory ran');
    });
    assert.throws(() => composeControllers([], [binding], []), /unknown controller binding/);
  });
  it('matches bindings by descriptor identity, even when another factory has the same name', () => {
    const first = fixture(['read']);
    const other = fixture(['read']);
    assert.throws(
      () => composeControllers([registration(first.factory)], [other.binding], [target]),
      /unknown controller binding/
    );
  });
  it('rejects duplicate bindings offline', () => {
    const { factory, binding } = fixture(['read']);
    assert.throws(
      () => composeControllers([registration(factory)], [binding, binding], [target]),
      /duplicate controller binding/
    );
  });
  it('requires a concrete binding for the selected replacement', () => {
    const first = fixture(['read']);
    const replacement = { ...first.factory, replaces: true as const };
    assert.throws(
      () =>
        composeControllers([registration(first.factory), registration(replacement, 'hook')], [first.binding], [target]),
      /missing controller binding/
    );
  });
  it('requires explicit replacement and rejects replacement without a target', () => {
    const first = fixture(['read']);
    const second = fixture(['read']);
    assert.throws(
      () => composeControllers([registration(first.factory), registration(second.factory, 'hook')], [], []),
      /requires replaces: true/
    );
    assert.throws(
      () => composeControllers([registration({ ...first.factory, replaces: true })], [], []),
      /replacement has no target/
    );
  });
  it('rejects duplicate declarations from one provider', () => {
    const { factory } = fixture(['read']);
    assert.throws(
      () => composeControllers([registration(factory), registration({ ...factory, replaces: true })], [], []),
      /duplicate controller/
    );
  });
  for (const actions of [[], ['helper'], ['read', 'helper']]) {
    it(`rejects replacement exposure changes (${actions.join(',') || 'empty'}) offline`, () => {
      const { factory } = fixture(['read']);
      assert.throws(
        () =>
          composeControllers(
            [registration(factory), registration({ ...factory, actions, replaces: true }, 'hook')],
            [],
            []
          ),
        /preserve action exposure/
      );
    });
  }
  it('validates requires against modules, without injecting constructor inputs', () => {
    const { factory, binding } = fixture(['read']);
    const dependent = { ...factory, requires: ['records'] };
    const bound = Object.assign(binding, { factory: dependent });
    assert.throws(
      () => composeControllers([registration(dependent)], [bound], [target]),
      /requires missing module records/
    );
    assert.throws(
      () => composeControllers([registration(dependent)], [bound], [target], ['Example']),
      /requires missing module/
    );
    assert.doesNotThrow(() => composeControllers([registration(dependent)], [bound], [target], ['records']));
  });
  it('rejects duplicate declared actions offline', () => {
    const { factory, binding } = fixture(['read', 'read']);
    assert.throws(() => composeControllers([registration(factory)], [binding], [target]), /duplicate actions/);
  });

  for (const action of [
    'constructor',
    'prototype',
    '__proto__',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    'toString',
    'valueOf',
    '',
  ]) {
    it(`rejects forbidden declared action ${JSON.stringify(action)} offline`, () => {
      const { factory, binding } = fixture([action], () => {
        throw new Error('factory ran');
      });
      assert.throws(() => composeControllers([registration(factory)], [binding], []), /forbidden action/);
    });
  }
  for (const action of ['constructor', '__proto__', 'toString']) {
    it(`rejects forbidden target ${action} offline`, () => {
      const { factory, binding } = fixture(['read']);
      assert.throws(
        () => composeControllers([registration(factory)], [binding], [{ ...target, action }]),
        /forbidden action target/
      );
    });
  }
  for (const [description, create] of [
    ['missing', () => ({})],
    ['non-callable', () => ({ read: 'data' })],
    ['shadowed inherited', () => Object.assign(new BaseController({ prefix: 'hidden' }), { read: 0 })],
  ] as const) {
    it(`rejects ${description} actions on the selected instance before ready/listen`, () => {
      const { factory, binding } = fixture(['read'], create);
      const composition = composeControllers([registration(factory)], [binding], [target]);
      assert.throws(() => composition.instantiate(), /missing or non-callable/);
    });
  }
  it('validates even declared actions that no route currently targets', () => {
    const { factory, binding } = fixture(['missing']);
    assert.throws(
      () => composeControllers([registration(factory)], [binding], []).instantiate(),
      /missing or non-callable/
    );
  });
  it('does not invoke action accessors', () => {
    let gets = 0;
    const { factory, binding } = fixture(['read'], () => ({
      get read() {
        gets++;
        return () => {};
      },
    }));
    assert.throws(() => composeControllers([registration(factory)], [binding], [target]).instantiate(), /non-callable/);
    assert.equal(gets, 0);
  });
  for (const [description, create] of [
    ['null', () => null!],
    ['undefined', () => undefined!],
    ['array', () => []],
    ['function', () => () => {}],
    ['promise', () => Promise.resolve({})],
  ] as const) {
    it(`rejects ${description} factory results, including with an empty allowlist`, () => {
      const { factory, binding } = fixture([], create);
      assert.throws(
        () => composeControllers([registration(factory)], [binding], []).instantiate(),
        /instance synchronously/
      );
    });
  }
  it('retains preparation failure and never reruns a factory after partial construction', () => {
    let creates = 0;
    const error = new Error('construction failed');
    const { factory, binding } = fixture(['read'], () => {
      creates++;
      throw error;
    });
    const composition = composeControllers([registration(factory)], [binding], [target]);
    for (let attempt = 0; attempt < 2; attempt++)
      assert.throws(
        () => composition.instantiate(),
        caught => caught === error
      );
    assert.equal(creates, 1);
  });
});
