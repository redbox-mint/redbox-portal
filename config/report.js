module.exports.reports = {
  "rdmpRecords": {
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
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.id }'>${ data.title }</a>"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "date_object_modified",
        "template" : "${ DateTime.fromISO(data.date_object_modified).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Date Created",
        "property": "date_object_created",
        "template" : "${ DateTime.fromISO(data.date_object_created).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Chief Investigator",
        "property": "contributor_ci.text_full_name",
        "template" : "${ data['contributor_ci.text_full_name'] }"
      }
    ]
  },
  "dataRecords": {
    "title": "List archival data records",
    "solr_query": "metaMetadata_type:dataRecord",
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
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.id }'>${ data.title }</a>"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "date_object_modified",
        "template" : "${ DateTime.fromISO(data.date_object_modified).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Date Created",
        "property": "date_object_created",
        "template" : "${ DateTime.fromISO(data.date_object_created).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Chief Investigator",
        "property": "contributor_ci.text_full_name",
        "template" : "${ data['contributor_ci.text_full_name'] }"
      }
    ]
  },
  "dataPublications": {
    "title": "List data publication records",
    "solr_query": "metaMetadata_type:dataPublication",
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
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.id }'>${ data.title }</a>"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "date_object_modified",
        "template" : "${ DateTime.fromISO(data.date_object_modified).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Date Created",
        "property": "date_object_created",
        "template" : "${ DateTime.fromISO(data.date_object_created).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Chief Investigator",
        "property": "contributor_ci.text_full_name",
        "template" : "${ data['contributor_ci.text_full_name'] }"
      }
    ]
  },
  "embargoedDataPublications": {
    "title": "List embargoed data publication records",
    "solr_query": "metaMetadata_type:dataPublication AND workflow_stage:embargoed",
    "filter": [{
        "paramName": "dateEmbargoUntilRange",
        "type": "date-range",
        "property": "date_embargoUntil",
        "message": "Filter by embargo date"
      },
      {
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
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.id }'>${ data.title }</a>"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "hide": true
      },
      {
        "label": "Embargo until",
        "property": "date_embargoUntil"
      },
      {
        "label": "Date Modified",
        "property": "date_object_modified",
        "template" : "${ DateTime.fromISO(data.date_object_modified).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Date Created",
        "property": "date_object_created",
        "template" : "${ DateTime.fromISO(data.date_object_created).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Chief Investigator",
        "property": "contributor_ci.text_full_name",
        "template" : "${ data['contributor_ci.text_full_name'] }"
      }
    ]
  },
  "workspaces": {
    "title": "List workspace records",
    "solr_query": "metaMetadata_packageType:workspace",
    "filter": [
      {
        "type": "date-range",
        "property": "date_object_modified",
        "message": "Filter by date modified"
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
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.id }'>${ data.title }</a>"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "date_object_modified",
        "template" : "${ DateTime.fromISO(data.date_object_modified).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Date Created",
        "property": "date_object_created",
        "template" : "${ DateTime.fromISO(data.date_object_created).toFormat('dd/MM/yyyy') }"
      }
    ]
  },
};
