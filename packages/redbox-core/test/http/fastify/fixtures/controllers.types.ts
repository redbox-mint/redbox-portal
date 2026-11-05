// This fixture is compiled by registration-types.test.ts, including every expected error.
// Use the built public entrypoint, as an external controller author does.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Request, Response } from 'express';
import {
  ApplicationStatusController,
  applicationStatusController,
  bindControllerFactory,
  defineController,
  type ApplicationStatusControllerInput,
  type ControllerAction,
  type ControllerFactory,
  type ControllerMethodName,
  type ControllerRegistration,
} from '@researchdatabox/redbox-core/http';

interface GreetingInput {
  readonly greeting: (name: string) => Promise<string>;
  readonly prefix: string;
}
interface GreetingRoute {
  Params: { name: string };
  Querystring: { formal?: boolean };
  Body: { title: string };
}
class GreetingController {
  public readonly label = 'greeting';
  public constructor(protected readonly input: GreetingInput) {}
  public async greet(request: FastifyRequest<GreetingRoute>, reply: FastifyReply): Promise<unknown> {
    const name: string = request.params.name;
    const formal: boolean | undefined = request.query.formal;
    const title: string = request.body.title;
    // @ts-expect-error Params preserve their declared field types.
    const numericName: number = request.params.name;
    // @ts-expect-error Unknown input fields are not silently accepted.
    request.body.undeclared;
    // @ts-expect-error Fastify replies do not expose Express response methods.
    reply.json({ name });
    void numericName;
    return reply
      .code(200)
      .send({ text: this.input.prefix + (await this.input.greeting(formal ? title + name : name)) });
  }
  public helper(): string {
    return this.label;
  }
}
const greeting = defineController({
  name: 'GreetingController',
  actions: ['greet'],
  create: (input: GreetingInput) => new GreetingController(input),
});
const checkedGreeting: ControllerAction<GreetingRoute> = GreetingController.prototype.greet;
const originalFactory: ControllerFactory<GreetingInput, GreetingController> = greeting;
const greetingBinding: () => GreetingController = bindControllerFactory(greeting, {
  greeting: async name => name.toUpperCase(),
  prefix: 'Hello ',
});
// @ts-expect-error Each concrete input is required, even though the collection erases it.
bindControllerFactory(greeting, { prefix: 'Hello ' });
// @ts-expect-error Dependency input types cannot widen during binder inference.
bindControllerFactory(greeting, { greeting: (name: number) => name, prefix: 'Hello ' });

interface ExtendedStatusInput extends ApplicationStatusControllerInput {
  readonly audit: () => void;
}
class ExtendedStatusController extends ApplicationStatusController {
  public constructor(input: ExtendedStatusInput) {
    super(input);
  }
}
const statusReplacement = defineController({
  name: 'ApplicationStatusController',
  replaces: true,
  // Deliberately exposed inherited Fastify action.
  actions: ['status'],
  create: (input: ExtendedStatusInput) => new ExtendedStatusController(input),
});
declare const coreInput: ApplicationStatusControllerInput;
declare const replacementInput: ExtendedStatusInput;
const coreBinding = bindControllerFactory(applicationStatusController, coreInput);
const replacementBinding = bindControllerFactory(statusReplacement, replacementInput);
// @ts-expect-error A subclass's extra dependencies must be bound explicitly.
bindControllerFactory(statusReplacement, coreInput);
// @ts-expect-error Inputs from unrelated controllers cannot be interchanged.
bindControllerFactory(greeting, replacementInput);
// @ts-expect-error Named core input exports retain the concrete domain operation signature.
const invalidCoreInput: ApplicationStatusControllerInput = { application: { status: () => 'ready' } };

const declarations: readonly ControllerRegistration[] = [applicationStatusController, statusReplacement, greeting];
const invalidProperty = defineController({
  name: 'Property',
  // @ts-expect-error Non-callable fields cannot appear in an allowlist.
  actions: ['label'],
  create: (input: GreetingInput) => new GreetingController(input),
});
const invalidMissing = defineController({
  name: 'Missing',
  // @ts-expect-error A method must exist on the constructed controller.
  actions: ['missing'],
  create: (input: GreetingInput) => new GreetingController(input),
});
const invalidConstructor = defineController({
  name: 'Internals',
  // @ts-expect-error Constructors are never actions.
  actions: ['constructor'],
  create: (input: GreetingInput) => new GreetingController(input),
});
// @ts-expect-error Object prototype internals are never action names.
const forbiddenName: ControllerMethodName<GreetingController> = 'toString';
// @ts-expect-error A typed action cannot take an unrelated request shape.
const wrongRequest: ControllerAction<GreetingRoute> = (request: { params: { name: number } }, _reply: FastifyReply) =>
  request.params.name;
// @ts-expect-error Express request/response handlers do not satisfy the native action contract.
const expressAction: ControllerAction<GreetingRoute> = (_request: Request, response: Response) => response.json({});
void [
  checkedGreeting,
  originalFactory,
  greetingBinding,
  coreBinding,
  replacementBinding,
  declarations,
  invalidCoreInput,
  invalidProperty,
  invalidMissing,
  invalidConstructor,
  forbiddenName,
  wrongRequest,
  expressAction,
];
