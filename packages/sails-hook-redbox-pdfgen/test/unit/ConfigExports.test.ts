const { expect } = require('@researchdatabox/redbox-dev-tools/testing');
const { PDFGenConfig, PDFGEN_CONFIG_MODEL, PDFGEN_CONFIG_SCHEMA } = require('../../dist/api/configmodels/PDFGenConfig');
const { agendaQueue, mergeAgendaQueueJobs } = require('../../dist/config/agendaQueue');
const { registerRedboxExtension } = require('../../dist/index.js');
const { pdfgen } = require('../../dist/config/pdfgen');
const packageJson = require('../../package.json');

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

  it('merges duplicate agenda jobs without discarding application-only settings', () => {
    const existingJobs = {
      'PDFService-CreatePDF': {
        fnName: 'applicationservice.createPDF',
        backend: 'sqs' as const,
        options: {
          concurrency: 8,
          priority: 'high' as const,
        },
        schedule: {
          method: 'every' as const,
          intervalOrSchedule: '10 minutes',
          opts: {
            timezone: 'Australia/Adelaide',
          },
        },
      },
    };

    const mergedJobs = mergeAgendaQueueJobs(existingJobs, agendaQueue.jobs);

    expect(mergedJobs['PDFService-CreatePDF']).to.deep.equal({
      fnName: 'rdmpservice.queuedTriggerSubscriptionHandler',
      backend: 'sqs',
      options: {
        concurrency: 1,
        priority: 'high',
        lockLifetime: 120 * 1000,
        lockLimit: 1,
      },
      schedule: {
        method: 'every',
        intervalOrSchedule: '10 minutes',
        opts: {
          timezone: 'Australia/Adelaide',
        },
      },
    });
  });

  it('registers the PDF token as a secret config field', () => {
    expect(PDFGEN_CONFIG_MODEL.secretFields).to.deep.equal(['token']);
  });

  it('declares redbox-core as its runtime compatibility peer', () => {
    expect(packageJson.peerDependencies).to.deep.equal({
      '@researchdatabox/redbox-core': 'file:../redbox-core',
    });
    expect(packageJson.devDependencies['@researchdatabox/redbox-core']).to.equal('file:../redbox-core');
    expect(packageJson.peerDependencies).to.not.have.property('@researchdatabox/redbox-core-types');
  });

  it('declares luxon as a pinned runtime dependency', () => {
    expect(packageJson.dependencies.luxon).to.equal('3.7.2');
  });

  it('leaves sourceUrlBase unset so the service can derive it from the current brand', () => {
    expect(pdfgen).to.not.have.property('sourceUrlBase');
    expect(new PDFGenConfig().sourceUrlBase).to.equal(undefined);
    expect(PDFGEN_CONFIG_SCHEMA.properties.sourceUrlBase).to.not.have.property('default');
  });

  it('exports PDF options as neutral non-array configuration', () => {
    expect(registerRedboxExtension().config).to.deep.equal({
      pdfgen,
    });
  });

  it('adds the declared PDF queue job without replacing existing jobs', () => {
    const existingJobs = {
      'SolrSearchService-CreateOrUpdateIndex': { fnName: 'solrsearchservice.createOrUpdateIndex' },
    };
    const extension = registerRedboxExtension();
    expect(Object.keys(mergeAgendaQueueJobs(existingJobs, extension.jobs))).to.deep.equal([
      'SolrSearchService-CreateOrUpdateIndex',
      'PDFService-CreatePDF',
    ]);
    expect(extension.modules[0].name).to.equal('pdf');
    expect(extension.modules[0].requires).to.deep.equal(['storage']);
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
