

import { expect } from 'chai';
import * as _ from 'lodash';
import { DateTime } from 'luxon';

// Mock sails global BEFORE requiring ReportsService
(global as any).sails = {
  log: {
    verbose: () => {},
    warn: () => {},
    error: () => {}
  }
};

// Mock _ global if not present
if (!(global as any)._) {
  (global as any)._ = _;
}

process.env["sails_redbox__mochaTesting"] = "true";

// Require ReportsService after mocks
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReportsService = require('../../../api/services/ReportsService');

describe('The Reporting Service', function () {
  before(function (done) {
    done()
  })

  it("Should generate valid data rows with Handlebars templates", function (done) {
    let reportConfig = {
      "title": "List RDMP records",
      "solr_query": "metaMetadata_type:rdmp",
      "filter": [{
          "paramName": "dateObjectModifiedRange",
          "type": "date-range",
          "property": "date_object_modified",
          "message": "Filter by date modified"
        },
        {
          "paramName": "dateObjectCreatedRange",
          "type": "date-range",
          "property": "date_object_created",
          "message": "Filter by date created"
        },
        {
          "paramName": "title",
          "type": "text",
          "property": "title",
          "message": "Filter by title"
        }
      ],
      "columns": [
        {
          "label": "Id",
          "property": "id",
          "hide": true
        },
        {
          "label": "Title",
          "property": "title",
          "template": "<a href='{{optTemplateData.brandingAndPortalUrl}}/record/view/{{id}}'>{{title}}</a>",
          "exportTemplate": "{{title}}"
        },
        {
          "label": "External URL",
          "property": "reportExternalURL",
          "exportTemplate": "{{optTemplateData.brandingAndPortalUrl}}/record/view/{{id}}",
          "hide": true
        },
        {
          "label": "Date Modified",
          "property": "date_object_modified",
          "template" : "{{formatDate date_object_modified \"dd/MM/yyyy hh:mm a\"}}"
        },
        {
          "label": "Date Created",
          "property": "date_object_created",
          "template" : "{{formatDate date_object_created \"dd/MM/yyyy hh:mm a\"}}"
        },
        {
          "label": "Chief Investigator",
          "property": "contributor_ci.text_full_name",
          "template" : "{{get this \"contributor_ci.text_full_name\"}}"
        }
      ]
    }

    let solrData = [
      {id: 1, title: "Record 1", date_object_modified: "2023-05-18T01:30:00+10:00", date_object_created: "2023-05-17T01:30:00+10:00", "contributor_ci.text_full_name": "Contributor 1"}
    ];

    let optTemplateData = {
      brandingAndPortalUrl: "http://localhost:1500/default/rdmp"
    }
    

    let result = ReportsService.getDataRows(reportConfig, solrData, optTemplateData);
    expect(result, 'result to have 1 row').to.have.length(1)

    expect(result[0][0], 'Expect first element of first row to be 1').to.have.equal(1)
    expect(result[0][1], 'Expect second element of first row to be Record 1').to.have.equal("Record 1")
    expect(result[0][2], 'Expect third element of first row to be http://localhost:1500/default/rdmp/record/view/1').to.have.equal("http://localhost:1500/default/rdmp/record/view/1")
    
    // Calculate expected date based on system timezone to avoid CI failures
    const expectedModified = DateTime.fromISO("2023-05-18T01:30:00+10:00").toFormat("dd/MM/yyyy hh:mm a");
    expect(result[0][3], `Expect fourth element of first row to be ${expectedModified}`).to.have.equal(expectedModified)
    
    const expectedCreated = DateTime.fromISO("2023-05-17T01:30:00+10:00").toFormat("dd/MM/yyyy hh:mm a");
    expect(result[0][4], `Expect fifth element of first row to be ${expectedCreated}`).to.have.equal(expectedCreated)
    
    expect(result[0][5], 'Expect sixth element of first row to be Contributor 1').to.have.equal("Contributor 1")
    done()
  })

  it("Should generate valid header row", function (done) {
    let reportConfig = {
      "title": "List RDMP records",
      "solr_query": "metaMetadata_type:rdmp",
      "filter": [{
          "paramName": "dateObjectModifiedRange",
          "type": "date-range",
          "property": "date_object_modified",
          "message": "Filter by date modified"
        },
        {
          "paramName": "dateObjectCreatedRange",
          "type": "date-range",
          "property": "date_object_created",
          "message": "Filter by date created"
        },
        {
          "paramName": "title",
          "type": "text",
          "property": "title",
          "message": "Filter by title"
        }
      ],
      "columns": [
        {
          "label": "Id",
          "property": "id",
          "hide": true
        },
        {
          "label": "Title",
          "property": "title",
          "template": "<a href='{{optTemplateData.brandingAndPortalUrl}}/record/view/{{id}}'>{{title}}</a>",
          "exportTemplate": "{{title}}"
        },
        {
          "label": "External URL",
          "property": "reportExternalURL",
          "exportTemplate": "{{optTemplateData.brandingAndPortalUrl}}/record/view/{{id}}",
          "hide": true
        },
        {
          "label": "Date Modified",
          "property": "date_object_modified",
          "template" : "{{formatDate date_object_modified \"dd/MM/yyyy hh:mm a\"}}"
        },
        {
          "label": "Date Created",
          "property": "date_object_created",
          "template" : "{{formatDate date_object_created \"dd/MM/yyyy hh:mm a\"}}"
        },
        {
          "label": "Chief Investigator",
          "property": "contributor_ci.text_full_name",
          "template" : "{{get this \"contributor_ci.text_full_name\"}}"
        }
      ]
    }



    let result = ReportsService.getCSVHeaderRow(reportConfig);
    expect(result, 'result to have 6 elements').to.have.length(6)
    sails.log.verbose(result)

    expect(result[0], 'Expect first element to be Id').to.have.equal("Id")
    expect(result[1], 'Expect second element to be Title').to.have.equal("Title")
    expect(result[2], 'Expect third element to be External URL').to.have.equal("External URL")
    expect(result[3], 'Expect fourth element to be Date Modified').to.have.equal("Date Modified")
    expect(result[4], 'Expect fifth element to be Date Created').to.have.equal("Date Created")
    expect(result[5], 'Expect fifth element to be Chief Investigator').to.have.equal("Chief Investigator")
   
    
    done()
  })

  it("Should parse JSON result when config.json is true", function () {
          const data = { name: "World" };
          const config = { 
              template: '{"greeting": "Hello {{name}}"}',
              json: true 
          };
          const result = ReportsService.runTemplate(data, config);
          expect(result).to.deep.equal({ greeting: "Hello World" });
      });

  it("Should return empty entries when report is not found", async function () {
    // Mock Report.findOne to return null
    (global as any).Report = {
      findOne: async () => null
    };

    const brand = { id: 'default' };
    const reportName = 'nonExistentReport';

    const result = await ReportsService.extractReportTemplates(brand, reportName);
    expect(result).to.be.an('array').that.is.empty;
  });

})