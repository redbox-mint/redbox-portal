module.exports.reports = {
  "rdmpRecords": {
    "title": "List RDMP records",
    "reportSource": "database",
    "databaseQuery": {
      queryName: "listRDMPRecords"
    },
    "filter": [
      {
        "paramName": "dateObjectModifiedRange",
        "type": "date-range",
        "message": "Filter by date modified",
        "database":{
          "fromProperty": "dateModifiedAfter",
          "toProperty": "dateModifiedBefore",
        }
      },
      {
        "paramName": "dateObjectCreatedRange",
        "type": "date-range",
        "message": "Filter by date created",
        "database":{
          "fromProperty": "dateCreatedAfter",
          "toProperty": "dateCreatedBefore",
        }
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
        "property": "oid",
        "hide": true
      },
      {
        "label": "Title",
        "property": "title",
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }'>${ data.title }</a>",
        "exportTemplate": "${data.title}"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "exportTemplate": "${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "lastSaveDate",
        "template" : "${ DateTime.fromISO(data.lastSaveDate).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Date Created",
        "property": "dateCreated",
        "template" : "${ DateTime.fromISO(data.dateCreated).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Chief Investigator",
        "property": "metadata.contributor_ci.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_ci.text_full_name', '')}"
      },
      {
        "label": "Data Manager",
        "property": "metadata.contributor_data_manager.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_data_manager.text_full_name', '') }"
      }
    ]
  },
  // Example using Solr instead of a named database query
  // "rdmpRecords": {
  //   "title": "List RDMP records",
  //   "solrQuery": {
  //     "baseQuery" : "metaMetadata_type:rdmp"
  //   },
  //   "filter": [{
  //       "paramName": "dateObjectModifiedRange",
  //       "type": "date-range",
  //       "property": "date_object_modified",
  //       "message": "Filter by date modified"
  //     },
  //     {
  //       "paramName": "dateObjectCreatedRange",
  //       "type": "date-range",
  //       "property": "date_object_created",
  //       "message": "Filter by date created"
  //     },
  //     {
  //       "paramName": "title",
  //       "type": "text",
  //       "property": "title",
  //       "message": "Filter by title"
  //     }
  //   ],
  //   "columns": [
  //     {
  //       "label": "Id",
  //       "property": "id",
  //       "hide": true
  //     },
  //     {
  //       "label": "Title",
  //       "property": "title",
  //       "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.id }'>${ data.title }</a>",
  //       "exportTemplate": "${data.title}"
  //     },
  //     {
  //       "label": "External URL",
  //       "property": "reportExternalURL",
  //       "exportTemplate": "${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.id }",
  //       "hide": true
  //     },
  //     {
  //       "label": "Date Modified",
  //       "property": "date_object_modified",
  //       "template" : "${ DateTime.fromISO(data.date_object_modified).toFormat('dd/MM/yyyy hh:mm a') }"
  //     },
  //     {
  //       "label": "Date Created",
  //       "property": "date_object_created",
  //       "template" : "${ DateTime.fromISO(data.date_object_created).toFormat('dd/MM/yyyy hh:mm a') }"
  //     },
  //     {
  //       "label": "Chief Investigator",
  //       "property": "contributor_ci.text_full_name",
  //       "template" : "${ data['contributor_ci.text_full_name'] }"
  //     }
  //   ]
  // },
  "dataRecords": {
    "title": "List archival data records",
    "reportSource": "database",
    "databaseQuery": {
      queryName: "listDRRecords"
    },
    "filter": [
      {
        "paramName": "dateObjectModifiedRange",
        "type": "date-range",
        "message": "Filter by date modified",
        "database":{
          "fromProperty": "dateModifiedAfter",
          "toProperty": "dateModifiedBefore",
        }
      },
      {
        "paramName": "dateObjectCreatedRange",
        "type": "date-range",
        "message": "Filter by date created",
        "database":{
          "fromProperty": "dateCreatedAfter",
          "toProperty": "dateCreatedBefore",
        }
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
        "property": "oid",
        "hide": true
      },
      {
        "label": "Title",
        "property": "title",
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }'>${ data.title }</a>",
        "exportTemplate": "${data.title}"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "exportTemplate": "${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "lastSaveDate",
        "template" : "${ DateTime.fromISO(data.lastSaveDate).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Date Created",
        "property": "dateCreated",
        "template" : "${ DateTime.fromISO(data.dateCreated).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Chief Investigator",
        "property": "metadata.contributor_ci.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_ci.text_full_name', '')}"
      },
      {
        "label": "Data Manager",
        "property": "metadata.contributor_data_manager.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_data_manager.text_full_name', '') }"
      }
    ]
  },
  "dataPublications": {
    "title": "List data publication records",
    "reportSource": "database",
    "databaseQuery": {
      queryName: "listDPRecords"
    },
    "filter": [
      {
        "paramName": "dateObjectModifiedRange",
        "type": "date-range",
        "message": "Filter by date modified",
        "database":{
          "fromProperty": "dateModifiedAfter",
          "toProperty": "dateModifiedBefore",
        }
      },
      {
        "paramName": "dateObjectCreatedRange",
        "type": "date-range",
        "message": "Filter by date created",
        "database":{
          "fromProperty": "dateCreatedAfter",
          "toProperty": "dateCreatedBefore",
        }
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
        "property": "oid",
        "hide": true
      },
      {
        "label": "Title",
        "property": "title",
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }'>${ data.title }</a>",
        "exportTemplate": "${data.title}"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "exportTemplate": "${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "lastSaveDate",
        "template" : "${ DateTime.fromISO(data.lastSaveDate).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Date Created",
        "property": "dateCreated",
        "template" : "${ DateTime.fromISO(data.dateCreated).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Chief Investigator",
        "property": "metadata.contributor_ci.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_ci.text_full_name', '')}"
      },
      {
        "label": "Data Manager",
        "property": "metadata.contributor_data_manager.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_data_manager.text_full_name', '') }"
      }
    ]
  },
  "embargoedDataPublications": {
    "title": "List embargoed data publication records",
    "reportSource": "database",
    "databaseQuery": {
      queryName: "listEmbargoedDPRecords"
    },
    "filter": [
      {
        "paramName": "dateEmbargoedRange",
        "type": "date-range",
        "message": "Filter by date embargoed",
        "database":{
          "fromProperty": "dateEmbargoedAfter",
          "toProperty": "dateEmbargoedBefore",
        }
      },
      {
        "paramName": "dateObjectModifiedRange",
        "type": "date-range",
        "message": "Filter by date modified",
        "database":{
          "fromProperty": "dateModifiedAfter",
          "toProperty": "dateModifiedBefore",
        }
      },
      {
        "paramName": "dateObjectCreatedRange",
        "type": "date-range",
        "message": "Filter by date created",
        "database":{
          "fromProperty": "dateCreatedAfter",
          "toProperty": "dateCreatedBefore",
        }
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
        "property": "oid",
        "hide": true
      },
      {
        "label": "Title",
        "property": "title",
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }'>${ data.title }</a>",
        "exportTemplate": "${data.title}"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "exportTemplate": "${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "lastSaveDate",
        "template" : "${ DateTime.fromISO(data.lastSaveDate).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Embargoed Until",
        "property": "metadata.embargoUntil",
        "template" : "${ DateTime.fromISO(data.metadata.embargoUntil).toFormat('dd/MM/yyyy') }"
      },
      {
        "label": "Chief Investigator",
        "property": "metadata.contributor_ci.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_ci.text_full_name', '')}"
      },
      {
        "label": "Data Manager",
        "property": "metadata.contributor_data_manager.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_data_manager.text_full_name', '') }"
      }
    ]
  },
  "workspaces": {
    "title": "List workspace records",
    "reportSource": "database",
    "databaseQuery": {
      queryName: "listWorkspaceRecords"
    },
    "filter": [
      {
        "paramName": "dateObjectModifiedRange",
        "type": "date-range",
        "message": "Filter by date modified",
        "database":{
          "fromProperty": "dateModifiedAfter",
          "toProperty": "dateModifiedBefore",
        }
      },
      {
        "paramName": "dateObjectCreatedRange",
        "type": "date-range",
        "message": "Filter by date created",
        "database":{
          "fromProperty": "dateCreatedAfter",
          "toProperty": "dateCreatedBefore",
        }
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
        "property": "oid",
        "hide": true
      },
      {
        "label": "Title",
        "property": "title",
        "template": "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }'>${ data.title }</a>",
        "exportTemplate": "${data.title}"
      },
      {
        "label": "External URL",
        "property": "reportExternalURL",
        "exportTemplate": "${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }",
        "hide": true
      },
      {
        "label": "Date Modified",
        "property": "lastSaveDate",
        "template" : "${ DateTime.fromISO(data.lastSaveDate).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Date Created",
        "property": "dateCreated",
        "template" : "${ DateTime.fromISO(data.dateCreated).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Chief Investigator",
        "property": "metadata.contributor_ci.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_ci.text_full_name', '')}"
      },
      {
        "label": "Data Manager",
        "property": "metadata.contributor_data_manager.text_full_name",
        "template" : "${ _.get(data, 'metadata.contributor_data_manager.text_full_name', '') }"
      }
    ]
  },
  "user": {
    "title": "List users",
    "reportSource": "database",
    "databaseQuery": {
      queryName: "listUsers"
    },
    "filter": [
      {
        "paramName": "dateObjectModifiedRange",
        "type": "date-range",
        "message": "Filter by last login date",
        "database":{
          "fromProperty": "lastLoginAfter",
          "toProperty": "lastLoginBefore",
        }
      },
      {
        "paramName": "dateObjectCreatedRange",
        "type": "date-range",
        "message": "Filter by date created",
        "database":{
          "fromProperty": "dateCreatedAfter",
          "toProperty": "dateCreatedBefore",
        }
      },
      {
        "paramName": "userType",
        "type": "text",
        "property": "userType",
        "message": "Filter by user type"
      }
    ],
    "columns": [
      {
        "label": "Name",
        "property": "name",
        "template": "${ _.get(data, 'metadata.name', '')}",
      },
      {
        "label": "Email",
        "property": "oid",
        "template" : "${ _.get(data, 'metadata.email', '')}"
      },
      {
        "label": "Username",
        "property": "title",
        "template" : "${ _.get(data, 'metadata.username', '') }"
      },
      {
        "label": "User Type",
        "property": "userType",
        "template" : "${ _.get(data, 'metadata.type', '') }"
      },
      {
        "label": "Date Last Login",
        "property": "lastLogin",
        "template" : "${ DateTime.fromISO(_.get(data, 'metadata.lastLogin', '')).toFormat('dd/MM/yyyy hh:mm a') }"
      },
      {
        "label": "Date Created",
        "property": "dateCreated",
        "template" : "${ DateTime.fromISO(data.dateCreated).toFormat('dd/MM/yyyy hh:mm a') }"
      }
    ]
  }
};
