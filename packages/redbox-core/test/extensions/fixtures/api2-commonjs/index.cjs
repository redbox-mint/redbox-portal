const { ApplicationStatusController, defineController } = require('@researchdatabox/redbox-core/http');

class ExtendedStatusController extends ApplicationStatusController {
  constructor(input) {
    super(input);
    // These application-owned fields must never become route metadata.
    this.access = { kind: 'public' };
    this.csrf = false;
    this.api = undefined;
  }
  status(request, reply) {
    this.input.audit();
    return super.status(request, reply);
  }
}
const replacement = defineController({
  name: 'ApplicationStatusController',
  replaces: true,
  actions: ['status'],
  requires: ['service'],
  create: input => {
    input.created('replacement');
    return new ExtendedStatusController(input);
  },
});
exports.replacement = replacement;
exports.registerRedboxExtension = async () => ({
  apiVersion: 2,
  controllers: [replacement],
  modules: [{ name: 'service', create: input => input.acquire() }],
  config: { example: { enabled: true } },
  forms: { example: { fields: [] } },
  workflows: { example: { steps: [] } },
  jobs: { example: { interval: 10 } },
  configModels: [{ name: 'example', definition: { enabled: true } }],
  contributors: [{ name: 'example', module: 'service' }],
  migrations: [{ name: 'fm017:001', requires: ['service'], run: input => input.acquire() }],
  bootstrap: [{ name: 'example', requires: ['service'], run: input => input.acquire() }],
  views: ['views'],
  assets: ['assets'],
});
