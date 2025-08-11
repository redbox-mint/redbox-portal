describe('The Named Query Service', function () {
  before(function (done) {
    done()
  })

  it("Build a valid query with default values", function (done) {

    const namedQueryConfig = {
      collectionName: "record",
      brandIdFieldPath: "metaMetadata.brandId",
      resultObjectMapping: {

      },
      mongoQuery: {
        "daysDatePath": null,
        "isoDatePath": null,
        "defaultIsoDatePath": null,
        "stringPath": null,
        "numberPath": null
      },
      queryParams: {

        daysDateParam: {

          type: "date",
          path: "daysDatePath",
          queryType: "<=",
          format: "days",
          whenUndefined: "defaultValue",
          defaultValue: "-1"
        },
        isoDateParam: {
          type: "date",
          queryType: "=>",
          path: "isoDatePath",
          format: "ISODate",
          whenUndefined: "defaultValue",
          defaultValue: "2024-12-17T00:00:00.000Z"
        },
        defaultIsoDateParam: {
          type: "date",
          queryType: "=>",
          path: "defaultIsoDatePath",
          whenUndefined: "defaultValue",
          defaultValue: "2024-12-18T00:00:00.000Z"
        },
        stringParam: {
          type: "string",
          path: "stringPath",
          queryType: 'contains',
          whenUndefined: "defaultValue",
          defaultValue: "defaultString"
        },
        //TODO: number doesn't support queryType of default value like the others
        numberParam: {
          type: "number",
          path: "numberPath"
        }

      }

    };

    const numberParamValue = 1;
    let paramMap = {numberParam: numberParamValue};

    NamedQueryService.setParamsInQuery(namedQueryConfig.mongoQuery, namedQueryConfig.queryParams, paramMap);
    expect(namedQueryConfig.mongoQuery.numberPath).to.equal(numberParamValue);
    expect(namedQueryConfig.mongoQuery.isoDatePath).to.deep.equal({ "=>": '2024-12-17T00:00:00.000Z'});
    expect(namedQueryConfig.mongoQuery.defaultIsoDatePath).to.deep.equal({ "=>": '2024-12-18T00:00:00.000Z'});
    expect(namedQueryConfig.mongoQuery.stringPath).to.deep.equal({contains: 'defaultString'});

    const daysDateString = namedQueryConfig.mongoQuery.daysDatePath["<="]
    expect(daysDateString).to.be.a('string');
    let yesterdayIsoString = moment().subtract(1, 'days').format('YYYY-MM-DD');
    expect(daysDateString).to.contain(yesterdayIsoString);
    
    done()
  })


  it("Build a valid query with passed values", function (done) {

    const namedQueryConfig = {
      collectionName: "record",
      brandIdFieldPath: "metaMetadata.brandId",
      resultObjectMapping: {

      },
      mongoQuery: {
        "daysDatePath": null,
        "isoDatePath": null,
        "stringPath": null,
        "numberPath": null
      },
      queryParams: {

        daysDateParam: {

          type: "date",
          path: "daysDatePath",
          queryType: "<=",
          format: "days",
          whenUndefined: "defaultValue",
          defaultValue: "-1"
        },
        isoDateParam: {
          type: "date",
          queryType: "=>",
          path: "isoDatePath",
          format: "ISODate",
          whenUndefined: "defaultValue",
          defaultValue: "2024-12-17T00:00:00.000Z"
        },
        defaultIsoDateParam: {
          type: "date",
          queryType: "=>",
          path: "defaultIsoDatePath",
          whenUndefined: "defaultValue",
          defaultValue: "2024-12-18T00:00:00.000Z"
        },
        stringParam: {
          type: "string",
          path: "stringPath",
          queryType: 'contains',
          whenUndefined: "defaultValue",
          defaultValue: "defaultString"
        },
        numberParam: {
          type: "number",
          path: "numberPath"
        }

      }

    };

    const daysDateParamValue = -2;
    const isoDateParamValue = "2024-12-18T00:00:00.000Z";
    const defaultIsoDateParamValue = "2024-12-18T00:00:00.000Z";
    const stringParamValue = "passedString";
    const numberParamValue = 2;
    let paramMap = {numberParam: numberParamValue, isoDateParam: isoDateParamValue, stringParam: stringParamValue, daysDateParam: daysDateParamValue, defaultIsoDateParamValue: defaultIsoDateParamValue};

    NamedQueryService.setParamsInQuery(namedQueryConfig.mongoQuery, namedQueryConfig.queryParams, paramMap);
    expect(namedQueryConfig.mongoQuery.numberPath).to.equal(numberParamValue);
    expect(namedQueryConfig.mongoQuery.isoDatePath).to.deep.equal({ "=>": isoDateParamValue});
    expect(namedQueryConfig.mongoQuery.defaultIsoDatePath).to.deep.equal({ "=>": defaultIsoDateParamValue});
    expect(namedQueryConfig.mongoQuery.stringPath).to.deep.equal({contains: stringParamValue});

    const daysDateString = namedQueryConfig.mongoQuery.daysDatePath["<="]
    expect(daysDateString).to.be.a('string');
    let dayBeforeYesterdayIsoString = moment().subtract(2, 'days').format('YYYY-MM-DD');
    expect(daysDateString).to.contain(dayBeforeYesterdayIsoString);
    
    done()
  })


})