import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Application } from '../../application';
import { defineController } from '../controllers';

/** Borrowed operations only; no runtime owner, service lookup, or request state. */
export interface ApplicationStatusControllerInput {
  readonly application: Pick<Application, 'status'>;
}

/** Minimal internal controller; no production route is installed by this declaration. */
export class ApplicationStatusController {
  public constructor(protected readonly input: ApplicationStatusControllerInput) {}

  public status(_request: FastifyRequest, reply: FastifyReply): unknown {
    return reply.send(this.input.application.status());
  }
}

export const applicationStatusController = defineController({
  name: 'ApplicationStatusController',
  actions: ['status'],
  create: (input: ApplicationStatusControllerInput) => new ApplicationStatusController(input),
});
