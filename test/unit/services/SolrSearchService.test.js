describe('The Solr Indexing Service', function () {
  before(function (done) {
    done()
  })

  let createdIndex = null
  it("Should start Indexing", function (done) {
    this.timeout(5000)
    let oid = "xxxxxxxxx"
    let record = {}
    SolrSearchService.index(oid, record)
    SolrSearchService.searchAdvanced('rdmp','test').then(result => {
      sails.log.debug("Index result: ")
      sails.log.debug(result)
      expect(result).to.not.be.null &&
        expect(result).to.have.property('responseHeader')
          .and.to.have.property('status')
          .and.equal(0) &&
        expect(result).to.have.property('response')
          .and.to.have.property('numFound')
          .and.equal(0)
      createdIndex = result
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done()
    })

  })

  it("Should produce a transformed document", function (done) {
    let originalPreIndexConfig = _.cloneDeep(sails.config.solr.preIndex)
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
      movedPropertyOriginalPosition: "movedValue",
      copiedPropertyOriginalPosition: "copiedValue",
      specialFlattenObject: {
        property1: "value1",
        property2: "value2"
      }
    }

    sails.config.solr.preIndex = testPreIndexConfig;

    let result = SolrSearchService.preIndex(testObject)
    
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
          
    sails.config.solr.preIndex = originalPreIndexConfig;
    done()
  })
})