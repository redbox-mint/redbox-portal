import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/EmailService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('EmailService', function() {
  let service: Services.Email;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.emailnotification = {
      settings: {
        enabled: true,
        serverOptions: {},
        templateDir: '/templates/'
      },
      defaults: {
        subject: 'Default Subject',
        from: 'from@example.com',
        format: 'text'
      },
      templates: {}
    };
    setupServiceTestGlobals(mockSails);

    service = new Services.Email();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('evaluateProperties', function() {
    it('should evaluate properties correctly', function() {
      const options = {
        to: 'to@example.com',
        subject: 'Subject <%= name %>',
        customProp: 'val'
      };
      const templateData = { name: 'Test' };
      
      const result = service.evaluateProperties(options, {}, templateData);
      
      expect(result.toRendered).to.equal('to@example.com');
      expect(result.subjectRendered).to.equal('Subject Test');
    });
  });
});

