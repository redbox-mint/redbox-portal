const { expect } = require('@researchdatabox/redbox-dev-tools/testing');
const { PDFGEN_CONFIG_MODEL, PDFGEN_CONFIG_SCHEMA } = require('../../src/api/configmodels/PDFGenConfig');
const { agendaQueue, mergeAgendaQueueJobs } = require('../../src/config/agendaQueue');
const hookFactory = require('../../dist/index.js');
const { pdfgen } = require('../../src/config/pdfgen');

describe('Config exports', () => {
  it('registers the PDF creation queue job', () => {
    expect(agendaQueue.jobs).to.deep.include({
      'PDFService-CreatePDF': {
        fnName: 'rdmpservice.queuedTriggerSubscriptionHandler',
        options: {
          lockLifetime: 120 * 1000,
          lockLimit: 1,
          concurrency: 1,
        },
      },
    });
  });

  it('preserves existing agenda queue jobs when the hook config is merged', () => {
    const existingJobs = {
      'SolrSearchService-CreateOrUpdateIndex': {
        fnName: 'solrsearchservice.createOrUpdateIndex',
      },
    };
    const mergedJobs = mergeAgendaQueueJobs(existingJobs, agendaQueue.jobs);

    expect(Object.keys(mergedJobs)).to.deep.equal(['SolrSearchService-CreateOrUpdateIndex', 'PDFService-CreatePDF']);
  });

  it('registers the PDF token as a secret config field', () => {
    expect(PDFGEN_CONFIG_MODEL.secretFields).to.deep.equal(['token']);
  });

  it('registerRedboxConfig only exports non-array config', () => {
    expect(hookFactory.registerRedboxConfig()).to.deep.equal({
      pdfgen,
    });
  });

  it('adds the PDF queue job during runtime initialization without replacing existing jobs', done => {
    const existingJobs = {
      'SolrSearchService-CreateOrUpdateIndex': {
        fnName: 'solrsearchservice.createOrUpdateIndex',
      },
    };
    const sails = {
      config: {
        agendaQueue: {
          options: {
            backend: 'mongodb',
          },
          jobs: existingJobs,
        },
      },
      services: {
        configservice: {
          mergeHookConfig: () => {},
        },
      },
      after: () => {},
      log: {
        warn: () => {},
        error: () => {},
      },
    };

    hookFactory(sails).initialize(() => {
      expect(Object.keys(sails.config.agendaQueue.jobs)).to.deep.equal([
        'SolrSearchService-CreateOrUpdateIndex',
        'PDFService-CreatePDF',
      ]);
      done();
    });
  });

  it('defines renderable nested controls for Puppeteer PDF options', () => {
    const pdfOptions = PDFGEN_CONFIG_SCHEMA.properties.PDFOptions;

    expect(pdfOptions.type).to.equal('object');
    expect(pdfOptions.additionalProperties).to.equal(false);
    expect(pdfOptions.properties).to.include.keys(['format', 'printBackground', 'landscape', 'scale', 'margin']);
  });

  it('limits PDF paper format to supported Puppeteer values', () => {
    const format = PDFGEN_CONFIG_SCHEMA.properties.PDFOptions.properties.format;

    expect(format.default).to.equal('A4');
    expect(format.enum).to.include.members(['A4', 'Letter', 'Legal', 'A3']);
  });

  it('renders PDF header and footer templates as textareas', () => {
    const properties = PDFGEN_CONFIG_SCHEMA.properties.PDFOptions.properties;

    expect(properties.headerTemplate.widget.formlyConfig.type).to.equal('textarea');
    expect(properties.footerTemplate.widget.formlyConfig.type).to.equal('textarea');
  });

  it('does not expose Puppeteer path in appconfiguration PDF options', () => {
    const properties = PDFGEN_CONFIG_SCHEMA.properties.PDFOptions.properties;

    expect(properties).to.not.have.property('path');
  });
});
