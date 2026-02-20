let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('RaidService', function() {
  let mockSails: any;
  let RaidService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        raid: {
          enabled: true,
          basePath: 'https://api.raid.org.au',
          token: 'test-token',
          servicePointId: 12345,
          orcidBaseUrl: 'https://orcid.org/',
          raidFieldName: 'raidUrl',
          saveBodyInMeta: true,
          retryJobName: 'MintRaidRetry',
          retryJobSchedule: 'in 5 minutes',
          retryJobMaxAttempts: 3,
          oauth: {
            url: 'https://auth.raid.org/token',
            client_id: 'test-client',
            username: 'test-user',
            password: 'test-password'
          },
          types: {
            contributor: {
              position: {
                'chief-investigator': { schemaUri: 'https://vocabulary.raid.org/contributor.position.schema/326', id: 'https://vocabulary.raid.org/contributor.position.schema/326' },
                'investigator': { schemaUri: 'https://vocabulary.raid.org/contributor.position.schema/327', id: 'https://vocabulary.raid.org/contributor.position.schema/327' }
              },
              roles: {
                schemaUri: 'https://credit.niso.org/',
                types: {
                  'Supervision': 'supervision',
                  'Investigation': 'investigation'
                }
              },
              hiearchy: {
                position: ['chief-investigator', 'investigator', 'other']
              },
              flags: {
                leader: ['chief-investigator'],
                contact: ['chief-investigator']
              }
            },
            subject: {
              'anzsrc-for': {
                id: 'https://linked.data.gov.au/def/anzsrc-for/2020/',
                schemaUri: 'https://linked.data.gov.au/def/anzsrc-for/2020/'
              }
            }
          }
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({ metadata: {} }),
      updateMeta: sinon.stub().resolves({}),
      appendToRecord: sinon.stub().resolves({ isSuccessful: () => true })
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key)
    };
    (global as any).AgendaQueueService = {
      now: sinon.stub(),
      schedule: sinon.stub()
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/RaidService');
    RaidService = new Services.Raid();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    delete (global as any).TranslationService;
    delete (global as any).AgendaQueueService;
    sinon.restore();
  });

  describe('constructor', function() {
    it('should set logHeader', function() {
      expect(RaidService.logHeader).to.equal('RaidService::');
    });
  });

  describe('getContributorId (private, test via buildContribVal)', function() {
    it('should validate ORCID format', function() {
      // Test via buildContribVal
      const contributors: Record<string, any> = {};
      const contribVal = {
        text_full_name: 'Test User',
        orcid: 'https://orcid.org/0000-0002-1234-5678'
      };
      const contribConfig = {
        position: 'chief-investigator',
        role: 'Supervision',
        fieldMap: { id: 'orcid' }
      };
      
      expect(() => {
        RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      }).to.not.throw();
    });

    it('should reject invalid ORCID', function() {
      const contributors: Record<string, any> = {};
      const contribVal = {
        text_full_name: 'Test User',
        orcid: 'invalid-orcid'
      };
      const contribConfig = {
        position: 'chief-investigator',
        role: 'Supervision',
        fieldMap: { id: 'orcid' },
        requireOrcid: true
      };
      
      expect(() => {
        RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      }).to.throw();
    });
  });

  describe('buildContribVal', function() {
    it('should ignore blank records', function() {
      const contributors: Record<string, any> = {};
      const contribVal = { text_full_name: '' };
      const contribConfig = {
        position: 'chief-investigator',
        role: 'Supervision',
        fieldMap: { id: 'orcid' }
      };
      
      RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      
      expect(Object.keys(contributors)).to.have.length(0);
    });

    it('should create contributor with valid ORCID', function() {
      const contributors: Record<string, any> = {};
      const orcidId = '0000-0002-1234-5678';
      const contribVal = {
        text_full_name: 'Test User',
        orcid: `https://orcid.org/${orcidId}`
      };
      const contribConfig = {
        position: 'chief-investigator',
        role: 'Supervision',
        fieldMap: { id: 'orcid' }
      };
      
      RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      
      const fullOrcidUrl = `https://orcid.org/${orcidId}`;
      expect(contributors).to.have.property(fullOrcidUrl);
      expect(contributors[fullOrcidUrl]).to.have.property('id', fullOrcidUrl);
    });

    it('should append role to existing contributor', function() {
      const orcidId = '0000-0002-1234-5678';
      const fullOrcidUrl = `https://orcid.org/${orcidId}`;
      const contributors: any = {
        [fullOrcidUrl]: {
          id: fullOrcidUrl,
          schemaUri: 'https://orcid.org/',
          position: [{ id: 'pos-1' }],
          role: [{ id: 'role-1' }]
        }
      };
      
      const contribVal = {
        text_full_name: 'Test User',
        orcid: fullOrcidUrl
      };
      const contribConfig = {
        position: 'investigator',
        role: 'Investigation',
        fieldMap: { id: 'orcid' }
      };
      
      RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      
      expect(contributors[fullOrcidUrl].role).to.have.length(2);
    });

    it('should not require ORCID when requireOrcid is false', function() {
      const contributors: Record<string, any> = {};
      const contribVal = {
        text_full_name: 'Test User',
        orcid: ''
      };
      const contribConfig = {
        position: 'chief-investigator',
        role: 'Supervision',
        fieldMap: { id: 'orcid' },
        requireOrcid: false
      };
      
      expect(() => {
        RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      }).to.not.throw();
    });
  });

  describe('getSubject', function() {
    it('should return subjects array', function() {
      const subjects: any[] = [];
      const subjectData = [
        { notation: '0601', label: 'Biochemistry and Cell Biology' },
        { notation: '0602', label: 'Ecology' }
      ];
      const fieldConfig = { dest: 'subjects' };
      
      const result = RaidService.getSubject({}, {}, fieldConfig, subjects, 'anzsrc-for', subjectData);
      
      expect(result).to.have.length(2);
      expect(result[0]).to.have.property('id');
      expect(result[0]).to.have.property('schemaUri');
      expect(result[0].keyword).to.have.length(1);
    });

    it('should handle empty subject data', function() {
      const subjects: any[] = [];
      
      const result = RaidService.getSubject({}, {}, { dest: 'subjects' }, subjects, 'anzsrc-for', []);
      
      expect(result).to.have.length(0);
    });

    it('should handle null subject data', function() {
      const subjects: any[] = [];
      
      const result = RaidService.getSubject({}, {}, { dest: 'subjects' }, subjects, 'anzsrc-for', null);
      
      expect(result).to.have.length(0);
    });
  });

  describe('getContributors', function() {
    it.skip('should build contributors from record (requires complex config)', function() {
      // This test requires a complex mapping configuration that matches the service implementation
    });

    it.skip('should handle array of contributors (requires complex config)', function() {
      // This test requires a complex mapping configuration that matches the service implementation
    });
  });

  describe('mintTrigger', function() {
    it('should skip minting when trigger condition not met', async function() {
      const record = { metadata: { raidUrl: 'existing-raid' } };
      const options = { triggerCondition: '<%= _.isEmpty(record.metadata.raidUrl) %>' };
      
      sinon.stub(RaidService, 'metTriggerCondition').returns('false');
      
      const result = await RaidService.mintTrigger('oid-1', record, options);
      
      expect(result).to.deep.equal(record);
    });
  });

  describe('mintPostCreateRetryHandler', function() {
    it('should schedule retry when attemptCount > 0', async function() {
      const oid = 'record-123';
      const record = {
        metaMetadata: {
          raid: {
            attemptCount: 1,
            options: { request: {} }
          }
        }
      };
      
      await RaidService.mintPostCreateRetryHandler(oid, record, {});
      
      expect((global as any).AgendaQueueService.schedule.called).to.be.true;
    });

    it('should not schedule when oid is empty', async function() {
      const record = {
        metaMetadata: {
          raid: { attemptCount: 1 }
        }
      };
      
      await RaidService.mintPostCreateRetryHandler('', record, {});
      
      expect((global as any).AgendaQueueService.schedule.called).to.be.false;
    });

    it('should not schedule when attemptCount is 0', async function() {
      const record = {
        metaMetadata: {
          raid: { attemptCount: 0 }
        }
      };
      
      await RaidService.mintPostCreateRetryHandler('oid-1', record, {});
      
      expect((global as any).AgendaQueueService.schedule.called).to.be.false;
    });
  });

  describe('mintRetryJob', function() {
    it('should call mintRaid with job data', async function() {
      const job = {
        attrs: {
          data: {
            oid: 'record-123',
            options: {},
            attemptCount: 2
          }
        }
      };
      
      (global as any).RecordsService.getMeta.resolves({ metadata: {} });
      const mintRaidStub = sinon.stub(RaidService as any, 'mintRaid').resolves({});
      
      await RaidService.mintRetryJob(job);
      
      expect(mintRaidStub.called).to.be.true;
      expect(mintRaidStub.firstCall.args[0]).to.equal('record-123');
      expect(mintRaidStub.firstCall.args[3]).to.equal(2); // attemptCount
    });
  });

  describe('setContributorFlags (private, test via buildContribVal)', function() {
    it('should set leader flag for chief-investigator', function() {
      const contributors: Record<string, any> = {};
      const contribVal = {
        text_full_name: 'Test User',
        orcid: 'https://orcid.org/0000-0002-1234-5678'
      };
      const contribConfig = {
        position: 'chief-investigator',
        role: 'Supervision',
        fieldMap: { id: 'orcid' }
      };
      
      RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      
      const fullOrcidUrl = 'https://orcid.org/0000-0002-1234-5678';
      expect(contributors[fullOrcidUrl]).to.have.property('leader', true);
      expect(contributors[fullOrcidUrl]).to.have.property('contact', true);
    });

    it('should not set leader flag for investigator', function() {
      const contributors: Record<string, any> = {};
      const contribVal = {
        text_full_name: 'Test User',
        orcid: 'https://orcid.org/0000-0002-1234-5678'
      };
      const contribConfig = {
        position: 'investigator',
        role: 'Investigation',
        fieldMap: { id: 'orcid' }
      };
      
      RaidService.buildContribVal(contributors, contribVal, contribConfig, '2024-01-01', '2024-12-31');
      
      const fullOrcidUrl = 'https://orcid.org/0000-0002-1234-5678';
      expect(contributors[fullOrcidUrl]).to.not.have.property('leader');
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = RaidService.exports();

      expect(exported).to.have.property('mintTrigger');
      expect(exported).to.have.property('buildContribVal');
      expect(exported).to.have.property('mintPostCreateRetryHandler');
      expect(exported).to.have.property('mintRetryJob');
    });
  });
});
