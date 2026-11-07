import { defineController } from '@researchdatabox/redbox-core/http';

await Promise.resolve();
class GreetingController {
  constructor(input) {
    this.input = input;
  }
  greet(_request, reply) {
    return reply.send({ greeting: this.input.prefix + this.input.name() });
  }
  helper() {
    throw new Error('Never expose a helper as a route');
  }
}
export const greeting = defineController({
  name: 'GreetingController',
  actions: ['greet'],
  requires: ['service'],
  create: input => {
    input.created('greeting');
    return new GreetingController(input);
  },
});
export default async function registerRedboxExtension() {
  return {
    apiVersion: 2,
    controllers: [greeting],
    routes: [
      {
        name: 'example-greeting',
        method: 'get',
        path: '/greeting',
        controller: 'GreetingController',
        action: 'greet',
        access: { kind: 'public' },
      },
    ],
    modules: [{ name: 'dependent', requires: ['service'], create: input => input.acquire() }],
    views: ['views'],
    assets: ['assets'],
  };
}
