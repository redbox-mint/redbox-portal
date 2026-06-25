import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { Services, EmailChannel, IntegrationNotificationPayload } from '../../src/services/IntegrationNotificationService';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

let expect!: Chai.ExpectStatic;

describe('IntegrationNotificationService', function () {
  let service: InstanceType<typeof Services.IntegrationNotificationService>;
  let mockAppConfigService: Record<string, sinon.SinonStub>;
  let mockBrandingService: Record<string, sinon.SinonStub>;
  let mockCacheService: Record<string, sinon.SinonStub>;
  let mockEmailService: Record<string, sinon.SinonStub>;

  const defaultBrandConfig = {
    enabled: true,
    statuses: ['failed'],
    recipients: ['admin@example.com'],
    recordUrlBase: 'http://example.com/record',
    throttle: { enabled: false, windowSeconds: 300 },
    recoveryAlerts: false,
    channels: [
      { type: 'email', enabled: true, recipients: ['admin@example.com'] },
    ],
    perIntegration: {},
  };

  function setupServiceTestConfig(customBrandConfig: Record<string, unknown> = defaultBrandConfig) {
    mockAppConfigService = {
      getAppConfigByBrandAndKey: sinon.stub().resolves(customBrandConfig),
    };
    mockBrandingService = {
      getBrandById: sinon.stub().returns({ name: 'default', id: 'brand-1' }),
      getDefault: sinon.stub().returns({ name: 'default', id: 'default-brand-id' }),
    };
    mockCacheService = {
      get: sinon.stub().returns(of(null)),
      set: sinon.stub(),
    };
    mockEmailService = {
      buildFromTemplate: sinon.stub().returns(of({ status: 200, body: '<html>test</html>' })),
      sendMessage: sinon.stub().returns(of({ success: true, msg: 'Sent' })),
    };

    const mockSails = createMockSails({
      config: {
        emailnotification: {
          settings: { enabled: true, templateDir: 'views/emailTemplates/' },
          defaults: { subject: 'Test', from: 'test@example.com', format: 'html' },
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    });

    setupServiceTestGlobals(mockSails);
    (global as any).AppConfigService = mockAppConfigService;
    (global as any).BrandingService = mockBrandingService;
    (global as any).CacheService = mockCacheService;
    (global as any).EmailService = mockEmailService;
    service = new Services.IntegrationNotificationService();
  }

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).AppConfigService;
    delete (global as any).BrandingService;
    delete (global as any).CacheService;
    delete (global as any).EmailService;
    sinon.restore();
  });

  describe('dispatch - status gating', function () {
    beforeEach(function () {
      setupServiceTestConfig();
    });

    it('dispatches notification for failed status', async function () {
      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
            message: 'Connection refused',
            errorDetail: 'Error: Connection refused',
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.calledOnce).to.be.true;
      const templateName = mockEmailService.buildFromTemplate.firstCall.args[0];
      expect(templateName).to.equal('integrationFailure');
      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
    });

    it('looks up notification config by brand id, not brand name', async function () {
      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockAppConfigService.getAppConfigByBrandAndKey.calledOnce).to.be.true;
      expect(mockAppConfigService.getAppConfigByBrandAndKey.firstCall.args[0]).to.equal('brand-1');
    });

    it('falls back to the default brand id when no brandId is provided', async function () {
      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockAppConfigService.getAppConfigByBrandAndKey.calledOnce).to.be.true;
      expect(mockAppConfigService.getAppConfigByBrandAndKey.firstCall.args[0]).to.equal('default-brand-id');
    });

    it('does not dispatch notification for started status', async function () {
      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'started',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.called).to.be.false;
      expect(mockEmailService.sendMessage.called).to.be.false;
    });

    it('does not dispatch notification for success without prior failure', async function () {
      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'success',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.called).to.be.false;
      expect(mockEmailService.sendMessage.called).to.be.false;
    });

    it('dispatches recovery notification for success when prior failure exists and recoveryAlerts is on', async function () {
      const configWithRecovery = {
        ...defaultBrandConfig,
        recoveryAlerts: true,
        statuses: ['failed', 'success'],
      };
      setupServiceTestConfig(configWithRecovery);

      const cacheKey = `intnotif:none:oid-1:figshare`;
      mockCacheService.get = sinon.stub().callsFake((key: string) => {
        if (key === cacheKey) {
          return of({ failedAt: new Date().toISOString() });
        }
        return of(null);
      });

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: undefined,
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'success',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.calledOnce).to.be.true;
      const templateName = mockEmailService.buildFromTemplate.firstCall.args[0];
      expect(templateName).to.equal('integrationRecovery');
      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
      expect(mockCacheService.set.calledWith(cacheKey, null, 0)).to.be.true;
    });
  });

  describe('dispatch - config disabled/no config', function () {
    it('does not call any channel when config is disabled', async function () {
      const disabledConfig = { ...defaultBrandConfig, enabled: false };
      setupServiceTestConfig(disabledConfig);

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.called).to.be.false;
      expect(mockEmailService.sendMessage.called).to.be.false;
    });

    it('does not call any channel when no brand config exists', async function () {
      setupServiceTestConfig();
      mockAppConfigService.getAppConfigByBrandAndKey.resolves({});

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.called).to.be.false;
      expect(mockEmailService.sendMessage.called).to.be.false;
    });
  });

  describe('EmailChannel', function () {
    beforeEach(function () {
      setupServiceTestConfig();
    });

    it('calls buildFromTemplate with correct template and sendMessage with joined recipients', async function () {
      const payload: IntegrationNotificationPayload = {
        kind: 'failure',
        title: 'Test Failure',
        summary: 'Test summary',
        severity: 'error',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      const emailChannel = new EmailChannel();
      await emailChannel.send(payload, {
        recipients: ['admin@example.com', 'ops@example.com'],
        channelConfig: {},
      });

      expect(mockEmailService.buildFromTemplate.calledOnce).to.be.true;
      expect(mockEmailService.buildFromTemplate.firstCall.args[0]).to.equal('integrationFailure');

      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
      expect(mockEmailService.sendMessage.firstCall.args[0]).to.equal('admin@example.com,ops@example.com');
    });

    it('warns and does not send when recipients are empty', async function () {
      const payload: IntegrationNotificationPayload = {
        kind: 'failure',
        title: 'Test Failure',
        summary: 'Test summary',
        severity: 'error',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      const emailChannel = new EmailChannel();
      await emailChannel.send(payload, {
        recipients: [],
        channelConfig: {},
      });

      expect(mockEmailService.sendMessage.called).to.be.false;
      expect((global as any).sails.log.warn.called).to.be.true;
    });

    it('uses custom template name when specified in channel config', async function () {
      const payload: IntegrationNotificationPayload = {
        kind: 'failure',
        title: 'Test Failure',
        summary: 'Test summary',
        severity: 'error',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      const emailChannel = new EmailChannel();
      await emailChannel.send(payload, {
        recipients: ['admin@example.com'],
        channelConfig: { template: 'customTemplate' },
      });

      expect(mockEmailService.buildFromTemplate.firstCall.args[0]).to.equal('customTemplate');
    });
  });

  describe('dispatch - throttle', function () {
    beforeEach(function () {
      const configWithThrottle = {
        ...defaultBrandConfig,
        throttle: { enabled: true, windowSeconds: 300 },
      };
      setupServiceTestConfig(configWithThrottle);
    });

    it('suppresses second failure within throttle window', async function () {
      const cacheKey = `intnotif:brand-1:oid-1:figshare`;
      mockCacheService.get = sinon.stub().callsFake((key: string) => {
        if (key === cacheKey) {
          return of({ failedAt: new Date().toISOString() });
        }
        return of(null);
      });

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.called).to.be.false;
      expect(mockEmailService.sendMessage.called).to.be.false;
    });

    it('sends notification again after throttle window expires', async function () {
      mockCacheService.get = sinon.stub().returns(of(null));

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.calledOnce).to.be.true;
      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
    });

    it('does not write throttle state when every channel send fails', async function () {
      mockEmailService.sendMessage = sinon.stub().returns(throwError(() => new Error('smtp down')));

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.calledOnce).to.be.true;
      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
      expect(mockCacheService.set.called).to.be.false;
    });
  });

  describe('dispatch - recovery', function () {
    beforeEach(function () {
      const configWithRecovery = {
        ...defaultBrandConfig,
        recoveryAlerts: true,
        statuses: ['failed', 'success'],
      };
      setupServiceTestConfig(configWithRecovery);
    });

    it('sends recovery notification after failure followed by success', async function () {
      const cacheKey = `intnotif:none:oid-1:figshare`;

      const getStub = sinon.stub();
      getStub.withArgs(cacheKey).returns(of({ failedAt: new Date().toISOString() }));
      mockCacheService.get = getStub;

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'success',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.calledOnce).to.be.true;
      expect(mockEmailService.buildFromTemplate.firstCall.args[0]).to.equal('integrationRecovery');
      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
      expect(mockCacheService.set.calledWith(cacheKey, null, 0)).to.be.true;
    });

    it('does nothing for success with no prior failure', async function () {
      mockCacheService.get = sinon.stub().returns(of(null));

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'success',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.buildFromTemplate.called).to.be.false;
      expect(mockEmailService.sendMessage.called).to.be.false;
    });
  });

  describe('dispatch - perIntegration override', function () {
    it('applies perIntegration override for specific integration', async function () {
      const configWithOverride = {
        ...defaultBrandConfig,
        recipients: ['global@example.com'],
        channels: [{ type: 'email', enabled: true, recipients: ['global@example.com'] }],
        perIntegration: {
          doi: {
            recipients: ['doi-specific@example.com'],
            channels: [{ type: 'email', enabled: true, recipients: ['doi-specific@example.com'] }],
          },
        },
      };
      setupServiceTestConfig(configWithOverride);

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'doi',
            integrationAction: 'publishDoi',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
      const recipients = mockEmailService.sendMessage.firstCall.args[0];
      expect(recipients).to.equal('doi-specific@example.com');
    });

    it('uses global config for integrations without override', async function () {
      const configWithOverride = {
        ...defaultBrandConfig,
        recipients: ['global@example.com'],
        channels: [{ type: 'email', enabled: true, recipients: ['global@example.com'] }],
        perIntegration: {
          doi: {
            recipients: ['doi-specific@example.com'],
          },
        },
      };
      setupServiceTestConfig(configWithOverride);

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);

      expect(mockEmailService.sendMessage.calledOnce).to.be.true;
      const recipients = mockEmailService.sendMessage.firstCall.args[0];
      expect(recipients).to.equal('global@example.com');
    });
  });

  describe('dispatch - error isolation', function () {
    it('does not throw when a channel send rejects', async function () {
      setupServiceTestConfig();
      mockEmailService.buildFromTemplate.throws(new Error('Template error'));

      const job = {
        attrs: {
          data: {
            redboxOid: 'oid-1',
            brandId: 'brand-1',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            startedAt: new Date().toISOString(),
          },
        },
      };

      await service.dispatch(job);
    });
  });
});

before(async function () {
  ({ expect } = await import('chai'));
});
