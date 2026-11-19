describe('The Solr Indexing Service', function () {
  before(function (done) {
    done()
  })

  let createdIndex = null
  it("Should start Indexing", function (done) {

    let coreIds = Object.keys(sails.config.solr.cores);
    for(let coreId of coreIds) {
      this.timeout(5000);
      let oid = "xxxxxxxxx";
      let record = {
        metaMetadata: {
          searchCore: coreId
        }
      };
      SolrSearchService.index(oid, record);
    
      SolrSearchService.searchAdvanced(coreId,null,'test').then(result => {
        sails.log.debug("Index result: ");
        sails.log.debug(result);
        expect(result).to.not.be.null &&
          expect(result).to.have.property('responseHeader')
            .and.to.have.property('status')
            .and.equal(0) &&
          expect(result).to.have.property('response')
            .and.to.have.property('numFound')
            .and.equal(0)
        createdIndex = result;
      }).catch(error => {
        fail("Exception thrown");
        sails.log.error(error);
        done();
      })
    }
    
    done();
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

  it("Should normalize Solr date fields without changing other values", function () {
    const coreId = Object.keys(sails.config.solr.cores)[0];
    const originalPreIndexConfig = _.cloneDeep(sails.config.solr.cores[coreId].preIndex);
    sails.config.solr.cores[coreId].preIndex = {
      copy: [
        { source: 'createdOn', dest: 'date_object_created' },
        { source: 'lastSaveDate', dest: 'date_object_modified' }
      ],
      flatten: { special: [] }
    };

    try {
      const result = SolrSearchService.preIndex({
        metaMetadata: { searchCore: coreId },
        createdOn: '2025-08-28T13:34:25+00:00',
        lastSaveDate: '2020-12-22T14:25:30.436+10:00',
        date_review: '2026-11-19T01:02:03+00:00',
        date_unknown: 'to be confirmed',
        title: 'unchanged'
      });

      expect(result.date_object_created).to.match(/Z$/);
      expect(Date.parse(result.date_object_created)).to.equal(Date.parse('2025-08-28T13:34:25+00:00'));
      expect(result.date_object_modified).to.equal('2020-12-22T04:25:30.436Z');
      expect(result.date_review).to.equal('2026-11-19T01:02:03.000Z');
      expect(result.date_unknown).to.equal('to be confirmed');
      expect(result.title).to.equal('unchanged');
    } finally {
      sails.config.solr.cores[coreId].preIndex = originalPreIndexConfig;
    }
  });
})
