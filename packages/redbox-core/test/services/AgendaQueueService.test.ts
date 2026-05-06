let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { UnsupportedFeatureError } from '@researchdatabox/agenda';
import { Services } from '../../src/services/AgendaQueueService';
import { cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('AgendaQueueService', function() {
  let originalSails: any;

  before(function() {
    originalSails = (global as any).sails;
    delete (global as any).sails;
  });

  after(function() {
    if (originalSails) {
      (global as any).sails = originalSails;
    } else {
      delete (global as any).sails;
    }
  });

  beforeEach(function() {
    (global as any).sails = createMockSails();
    (global as any)._ = require('lodash');
  });

  afterEach(function() {
    sinon.restore();
    cleanupServiceTestGlobals();
    delete (global as any)._;
    delete (global as any).User;
  });

  function createAgendaStub(overrides: any = {}) {
    return {
      attrs: { backend: 'mongodb' },
      define: sinon.stub(),
      every: sinon.stub().resolves(undefined),
      schedule: sinon.stub().resolves(undefined),
      now: sinon.stub().resolves(undefined),
      jobs: sinon.stub().resolves([]),
      create: sinon.stub().callsFake((name: string) => ({
        attrs: { name, nextRunAt: new Date() },
        schedule: sinon.stub().returnsThis()
      })),
      start: sinon.stub().resolves(undefined),
      on: sinon.stub(),
      ...overrides
    };
  }

  function setupGlobals(mockSails: any) {
    (global as any).sails = mockSails;
    (global as any)._ = require('lodash');
    (global as any).User = {
      getDatastore: () => ({
        manager: {
          collection: sinon.stub().returns({
            createIndex: sinon.stub().resolves(undefined)
          })
        }
      })
    };
  }

  describe('Constructor', function() {
    it('should instantiate without throwing error when sails is undefined', function() {
      delete (global as any).sails;

      let service: Services.AgendaQueue;
      try {
        service = new Services.AgendaQueue();
      } catch (e: unknown) {
        throw new Error(`Constructor threw error: ${e instanceof Error ? e.message : String(e)}`);
      }

      expect(service).to.be.an.instanceOf(Services.AgendaQueue);
    });

    it('should have a public init method', function() {
      const mockSails = createMockSails();
      (global as any).sails = mockSails;

      const service = new Services.AgendaQueue();

      expect(service.init).to.be.a('function');
    });
  });

  describe('exports', function() {
    it('should export all public methods without sails defined', function() {
      delete (global as any).sails;

      const service = new Services.AgendaQueue();
      const exported = service.exports();

      expect(exported).to.have.property('every');
      expect(exported).to.have.property('schedule');
      expect(exported).to.have.property('now');
      expect(exported).to.have.property('jobs');
      expect(exported).to.have.property('sampleFunctionToDemonstrateHowToDefineAJobFunction');
      expect(exported).to.have.property('defineJob');
      expect(exported).to.have.property('moveCompletedJobsToHistory');
    });
  });

  describe('every', function() {
    it('allows recurring schedules for Mongo-backed jobs', function() {
      const service = new Services.AgendaQueue();
      const agendaEvery = sinon.stub();

      (service as any).agendas = { mongodb: { every: agendaEvery } };
      (service as any).jobBackendByName = new Map([['mongo-job', 'mongodb']]);

      service.every('mongo-job', '5 minutes', { sample: true }, { timezone: 'UTC' });

      expect(agendaEvery.calledOnceWithExactly('5 minutes', 'mongo-job', { sample: true }, { timezone: 'UTC' })).to.equal(true);
    });

    it('defaults unknown jobs to Mongo recurring schedules', function() {
      const service = new Services.AgendaQueue();
      expect(() => service.every('default-job', '5 minutes')).to.throw("AgendaQueue:: Unknown job 'default-job'. Define it in sails.config.agendaQueue.jobs before queuing it.");
    });

    it('rejects recurring schedules for SQS-backed jobs', function() {
      const service = new Services.AgendaQueue();
      const agendaEvery = sinon.stub();

      (service as any).agendas = { sqs: { every: agendaEvery } };
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      expect(() => service.every('sqs-job', '5 minutes')).to.throw("AgendaQueue:: every() is not supported for SQS-backed job 'sqs-job'. Use an external scheduler for SQS-backed recurring jobs.");
      expect(agendaEvery.called).to.equal(false);
    });
  });

  describe('routing', function() {
    it('routes now() to the job backend', function() {
      const service = new Services.AgendaQueue();
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });

      (service as any).agendas = { sqs: sqsAgenda };
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      service.now('sqs-job', { sample: true });

      expect(sqsAgenda.now.calledOnceWithExactly('sqs-job', { sample: true })).to.equal(true);
    });

    it('routes schedule() to the Mongo backend', function() {
      const service = new Services.AgendaQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });

      (service as any).agendas = { mongodb: mongoAgenda };
      (service as any).jobBackendByName = new Map([['mongo-job', 'mongodb']]);

      service.schedule('mongo-job', 'in 5 minutes', { sample: true });

      expect(mongoAgenda.schedule.calledOnceWithExactly('in 5 minutes', 'mongo-job', { sample: true })).to.equal(true);
    });

    it('rejects SQS schedules over 15 minutes', function() {
      const service = new Services.AgendaQueue();
      const sqsAgenda = createAgendaStub({
        attrs: { backend: 'sqs' },
        create: sinon.stub().returns({
          attrs: { nextRunAt: new Date(Date.now() + (16 * 60 * 1000)) },
          schedule: sinon.stub().returnsThis()
        })
      });

      (service as any).agendas = { sqs: sqsAgenda };
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      expect(() => service.schedule('sqs-job', 'in 16 minutes')).to.throw(UnsupportedFeatureError, "AgendaQueue:: schedule() only supports delays up to 15 minutes for SQS-backed job 'sqs-job'.");
      expect(sqsAgenda.schedule.called).to.equal(false);
    });

    it('rejects invalid SQS schedules', function() {
      const service = new Services.AgendaQueue();
      const sqsAgenda = createAgendaStub({
        attrs: { backend: 'sqs' },
        create: sinon.stub().returns({
          attrs: { nextRunAt: new Date('invalid') },
          schedule: sinon.stub().returnsThis()
        })
      });

      (service as any).agendas = { sqs: sqsAgenda };
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      expect(() => service.schedule('sqs-job', 'not a date')).to.throw("AgendaQueue:: schedule() received an invalid schedule for SQS-backed job 'sqs-job'.");
      expect(sqsAgenda.schedule.called).to.equal(false);
    });

    it('rejects jobs() when only SQS is configured', async function() {
      const service = new Services.AgendaQueue();

      (service as any).agendas = { sqs: createAgendaStub({ attrs: { backend: 'sqs' } }) };

      try {
        await service.jobs();
        throw new Error('Expected jobs() to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(UnsupportedFeatureError);
        expect((error as Error).message).to.equal('AgendaQueue:: jobs() is only supported when a MongoDB-backed agenda is configured.');
      }
    });

    it('rejects jobs() queries that target SQS-backed jobs', async function() {
      const service = new Services.AgendaQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });

      (service as any).agendas = { mongodb: mongoAgenda };
      (service as any).jobBackendByName = new Map([
        ['mongo-job', 'mongodb'],
        ['sqs-job', 'sqs']
      ]);

      try {
        await service.jobs({ name: 'sqs-job' } as any);
        throw new Error('Expected jobs() to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(UnsupportedFeatureError);
        expect((error as Error).message).to.equal('AgendaQueue:: jobs() is not supported for SQS-backed jobs.');
      }
      expect(mongoAgenda.jobs.called).to.equal(false);
    });
  });

  describe('startup configuration', function() {
    it('applies the default backend and per-job overrides', async function() {
      const mockSails = createMockSails({
        config: {
          agendaQueue: {
            options: {
              backend: 'sqs',
              sqs: {
                queueUrl: 'http://localstack:4566/queue/jobs',
                region: 'ap-southeast-2'
              }
            },
            jobs: [
              { name: 'default-job', fnName: 'testservice.defaultJob' },
              { name: 'override-job', fnName: 'testservice.overrideJob', backend: 'mongodb' }
            ]
          }
        },
        services: {
          testservice: {
            defaultJob: sinon.stub().resolves(undefined),
            overrideJob: sinon.stub().resolves(undefined)
          }
        }
      });
      setupGlobals(mockSails);

      const service = new Services.AgendaQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });
      const createAgendaForBackend = sinon.stub(service as any, 'createAgendaForBackend');
      createAgendaForBackend.withArgs('mongodb', sinon.match.any, sinon.match.any).returns(mongoAgenda);
      createAgendaForBackend.withArgs('sqs', sinon.match.any, sinon.match.any).returns(sqsAgenda);

      await (service as any).handleReady();

      expect((service as any).defaultBackend).to.equal('sqs');
      expect((service as any).jobBackendByName.get('default-job')).to.equal('sqs');
      expect((service as any).jobBackendByName.get('override-job')).to.equal('mongodb');
      expect(createAgendaForBackend.calledTwice).to.equal(true);
      expect(sqsAgenda.define.calledOnceWithExactly('default-job', sinon.match.func)).to.equal(true);
      expect(mongoAgenda.define.calledOnceWithExactly('override-job', sinon.match.func)).to.equal(true);
    });

    it('starts only the required backends', async function() {
      const mockSails = createMockSails({
        config: {
          agendaQueue: {
            options: {
              backend: 'sqs',
              sqs: {
                queueUrl: 'http://localstack:4566/queue/jobs',
                region: 'ap-southeast-2'
              }
            },
            jobs: [
              { name: 'sqs-job', fnName: 'testservice.process' }
            ]
          }
        },
        services: {
          testservice: {
            process: sinon.stub().resolves(undefined)
          }
        }
      });
      setupGlobals(mockSails);

      const service = new Services.AgendaQueue();
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });
      const createAgendaForBackend = sinon.stub(service as any, 'createAgendaForBackend');
      createAgendaForBackend.withArgs('sqs', sinon.match.any, sinon.match.any).returns(sqsAgenda);

      await (service as any).handleReady();

      expect(createAgendaForBackend.calledOnceWithExactly('sqs', sinon.match.object, sinon.match.any)).to.equal(true);
      expect((service as any).agendas.mongodb).to.equal(undefined);
      expect(sqsAgenda.start.calledOnce).to.equal(true);
    });

    it('allows inline startup every schedules for Mongo-backed jobs', async function() {
      const mockSails = createMockSails({
        config: {
          agendaQueue: {
            options: {
              backend: 'mongodb',
              collection: 'agendaJobs'
            },
            jobs: [
              {
                name: 'history-job',
                fnName: 'testservice.process',
                backend: 'mongodb',
                schedule: {
                  method: 'every',
                  intervalOrSchedule: '5 minutes'
                }
              }
            ]
          }
        },
        services: {
          testservice: {
            process: sinon.stub().resolves(undefined)
          }
        }
      });
      setupGlobals(mockSails);

      const service = new Services.AgendaQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });
      sinon.stub(service as any, 'createAgendaForBackend').withArgs('mongodb', sinon.match.any, sinon.match.any).returns(mongoAgenda);

      await (service as any).handleReady();

      expect(mongoAgenda.every.calledOnceWithExactly('5 minutes', 'history-job', undefined, undefined)).to.equal(true);
    });

    it('rejects inline startup every schedules for SQS-backed jobs', async function() {
      const mockSails = createMockSails({
        config: {
          agendaQueue: {
            options: {
              backend: 'sqs',
              sqs: {
                queueUrl: 'http://localstack:4566/queue/jobs',
                region: 'ap-southeast-2'
              }
            },
            jobs: [
              {
                name: 'sqs-recurring-job',
                fnName: 'testservice.process',
                schedule: {
                  method: 'every',
                  intervalOrSchedule: '5 minutes'
                }
              }
            ]
          }
        },
        services: {
          testservice: {
            process: sinon.stub().resolves(undefined)
          }
        }
      });
      setupGlobals(mockSails);

      const service = new Services.AgendaQueue();
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });
      sinon.stub(service as any, 'createAgendaForBackend').withArgs('sqs', sinon.match.any, sinon.match.any).returns(sqsAgenda);

      try {
        await (service as any).handleReady();
        throw new Error('Expected startup schedule validation to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(UnsupportedFeatureError);
        expect((error as Error).message).to.equal("AgendaQueue:: every() is not supported for SQS-backed job 'sqs-recurring-job'. Use an external scheduler for SQS-backed recurring jobs.");
      }
    });
  });
});
