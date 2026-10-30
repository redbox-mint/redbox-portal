import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { beforeSolrFixtureDeadline, solrFixtureQueueSettings, SolrIndexFixtureLifecycle } from './solr-index-fixture-lifecycle';

describe('The Solr Indexing Service', function () {
  before(function (done) {
    done()
  })

  it("Should start Indexing", async function () {
    const coreIds = Object.keys(sails.config.solr.cores);
    expect(coreIds).to.not.be.empty;
    // Separate work/cleanup budgets, with headroom so Mocha cannot end the test
    // while its own finally block is still coordinating a worker.
    this.timeout(85000 * coreIds.length);

    const datastore = User.getDatastore();
    const { collectionName } = solrFixtureQueueSettings(sails.config, datastore, sails.getDatastore('mongodb'));
    const manager = datastore.manager;
    // Sails emits ready without joining Agenda initialization. Use the public
    // query API to wait for the Mongo queue before defining the fixture job.
    const readyDeadline = performance.now() + 15000;
    while (true) {
      try {
        await beforeSolrFixtureDeadline(readyDeadline, 'Agenda fixture readiness', () => AgendaQueueService.jobs());
        break;
      } catch (error) {
        if (!String(error).includes('only supported when a MongoDB-backed agenda is configured')) throw error;
        if (performance.now() >= readyDeadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    for (const coreId of coreIds) {
      const oid = `solr-index-test-${randomUUID()}`;
      const title = `Solr indexing fixture ${oid}`;
      const record = {
        metaMetadata: {
          searchCore: coreId
        },
        metadata: { title }
      };

      const deadline = performance.now() + 45000;
      const label = `Solr indexing fixture ${coreId} (${oid}), queue ${collectionName}`;
      // Only this process defines this random name. Other workers using the
      // shared Mongo collection do not scan or claim unknown definitions.
      const jobName = `solr-index-fixture-${randomUUID()}`;
      const jobQuery = { name: jobName, 'data.id': oid, 'data.metaMetadata.searchCore': coreId };
      const lifecycle = new SolrIndexFixtureLifecycle(manager.collection(collectionName), manager.collection(`${collectionName}History`),
        jobQuery, label, job => SolrSearchService.solrAddOrUpdate(job));
      AgendaQueueService.defineJob(jobName, {}, lifecycle.handler);
      const originalJobName = sails.config.solr.createOrUpdateJobName;
      let submission: Promise<boolean>;
      try {
        // index() captures the configured name synchronously before its first
        // await. Restore it immediately, before any other task can submit work.
        sails.config.solr.createOrUpdateJobName = jobName;
        submission = SolrSearchService.index(oid, record);
      } finally {
        sails.config.solr.createOrUpdateJobName = originalJobName;
      }
      let primaryFailed = false;
      try {
        expect(await beforeSolrFixtureDeadline(deadline, `${label}: submission`, () => submission), `Index submission for ${coreId}`).to.equal(true);

        // index() acknowledges submission only. Observe this job finishing before
        // searching; the worker commits its Solr changes before it completes.
        let completed = false;
        while (performance.now() < deadline) {
          const job = await lifecycle.observe(deadline);
          if (job) {
            expect(job.failReason, `Index job for ${coreId} failed: ${job.failReason}`).to.not.exist;
            if (job.lastFinishedAt && !job.lockedAt && !job.nextRunAt) {
              completed = true;
              break;
            }
          }
          await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, deadline - performance.now()))));
        }
        expect(completed, `Index job for ${coreId} (${oid}) did not complete within 45 seconds`).to.equal(true);

        expect(lifecycle.admittedCount, 'The real queue must invoke the fenced handler').to.be.greaterThan(0);
        const query = new URLSearchParams({ q: `id:"${oid}"`, fl: 'id,title', rows: '1', wt: 'json' });
        const result = await beforeSolrFixtureDeadline<Record<string, any>>(deadline, `${label}: search`, () => SolrSearchService.searchAdvanced(coreId, null, query));
        expect(result).to.have.nested.property('responseHeader.status', 0);
        expect(result).to.have.nested.property('response.numFound', 1);
        expect(result.response.docs).to.have.lengthOf(1);
        expect(result.response.docs[0]).to.include({ id: oid, title });
      } catch (error) {
        primaryFailed = true;
        throw error;
      } finally {
        try {
          await lifecycle.cleanup(submission, performance.now() + 15000,
            () => SolrSearchService.solrDelete({ attrs: { data: { id: oid, searchCore: coreId } } }));
          const absent = await beforeSolrFixtureDeadline<Record<string, any>>(performance.now() + 5000,
            `${label}: verify cleanup`, () => SolrSearchService.searchAdvanced(coreId, null,
              new URLSearchParams({ q: `id:"${oid}"`, rows: '1', wt: 'json' })));
          expect(absent).to.have.nested.property('responseHeader.status', 0);
          expect(absent).to.have.nested.property('response.numFound', 0);
          sails.log.info(`${label}: post-cleanup Solr numFound=0 (admitted handlers: ${lifecycle.admittedCount})`);
        } catch (cleanupError) {
          if (!primaryFailed) throw cleanupError;
          // Keep the original assertion/transport failure as Mocha's failure.
          // Include the fixture identity and secondary error for recovery.
          sails.log.error(`${label}: cleanup also failed; inspect retained job/fixture`, cleanupError);
        }
      }
    }
  })


  it("Should produce a transformed document", function (done) {

    let coreIds = Object.keys(sails.config.solr.cores);
    for(let coreId of coreIds) {

      let originalPreIndexConfig = _.cloneDeep(sails.config.solr.cores[coreId].preIndex);
      let testPreIndexConfig = {
        move: [
          {
            source: 'movedPropertyOriginalPosition',
            dest: 'movedPropertyNewPosition'
          }
        ],
        copy: [
          {
            source: 'copiedPropertyOriginalPosition',
            dest: 'copiedPropertyNewPosition'
          }
        ],
        flatten: {
          special: [
            {
              source: 'specialFlattenObject',
              options: {
                safe: false,
                delimiter: '_'
              }
            }
          ]
        },
        jsonString: [{
          source: 'specialFlattenObject',
          dest: 'jsonStringifiedObject'
        }],
        template: [
          {
            template: '<%= data.specialFlattenObject.property1 + data.specialFlattenObject.property2 %>',
            dest: "templatespecialFlattenObjectProperty1AndProperty2"
          }
        ]
      }

      let testObject = {
        metaMetadata: {
          searchCore: coreId
        },
        movedPropertyOriginalPosition: "movedValue",
        copiedPropertyOriginalPosition: "copiedValue",
        specialFlattenObject: {
          property1: "value1",
          property2: "value2"
        }
      }

      sails.config.solr.cores[coreId].preIndex = testPreIndexConfig;

      let result = SolrSearchService.preIndex(testObject);
      
      // Test move function
      expect(result, 'movedPropertyOriginalPosition does not exist').to.not.have.property('movedPropertyOriginalPosition');
      expect(result, 'movedPropertyNewPosition exists and has correct value').to.have.property('movedPropertyNewPosition').and.equal("movedValue");

      // Test copy function
      expect(result, 'copiedPropertyOriginalPosition exists and has correct value').to.have.property('copiedPropertyOriginalPosition').and.equal("copiedValue");
      expect(result, 'copiedPropertyNewPosition exists and has correct value').to.have.property('copiedPropertyNewPosition').and.equal("copiedValue");

      // Test special flatten function
      expect(result, 'specialFlattenObject_property1 exists and has correct value').to.have.property('specialFlattenObject_property1').and.equal("value1");
      expect(result, 'specialFlattenObject_property2 exists and has correct value').to.have.property('specialFlattenObject_property2').and.equal("value2");

      // Test jsonString function
      expect(result, 'stringified version of specialFlattenObject exists on property jsonStringifiedObject').to.have.property('jsonStringifiedObject').and.equal(JSON.stringify(testObject.specialFlattenObject));

      // Test template function
      expect(result, 'template evaluated correctly and stored into property templatespecialFlattenObjectProperty1AndProperty2').to.have.property('templatespecialFlattenObjectProperty1AndProperty2').and.equal('value1value2');
            
      sails.config.solr.cores[coreId].preIndex = originalPreIndexConfig;
    }

    done();
  })
})
