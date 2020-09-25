module.exports.reports = {
  "orphanRecords": {
      "title": "Records that are not yet assigned to a user",
      "solr_query": "-authorization_edit:[\"\" TO *]",
      "filter": {
        "type": "date-range",
        "property": "date_object_created",
        "message": "Filter by date created"
      },
      "columns": [
        {
        "label": "Id",
        "property": "storage_id",
        "show": false
      },
      {
        "label": "Title",
        "property": "title",
        "link": {
            "pattern": "record/view/${storage_id}"
        }
      },
      {
        "label": "Date Created",
        "property": "date_object_created"
      },
      {
        "label": "Pending Users",
        "property": "authorization_editPending",
        "multivalue": true
      }
      ]
  },
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
      "property": "storage_id",
      "show": false
    },
    {
      "label": "Title",
      "property": "title",
      "link": {
          "pattern": "record/view/${storage_id}"
      }
    },
    {
      "label": "Date Modified",
      "property": "date_object_modified"
    },
    {
      "label": "Date Created",
      "property": "date_object_created"
    },
    {
      "label": "Chief Investigator",
      "property": "contributor_ci.text_full_name"
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
    "property": "storage_id",
    "show": false
  },
  {
    "label": "Title",
    "property": "title",
    "link": {
        "pattern": "record/view/${storage_id}"
    }
  },
  {
    "label": "Date Modified",
    "property": "date_object_modified"
  },
  {
    "label": "Date Created",
    "property": "date_object_created"
  },
  {
    "label": "Chief Investigator",
    "property": "contributor_ci.text_full_name"
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
    "property": "storage_id",
    "show": false
  },
  {
    "label": "Title",
    "property": "title",
    "link": {
        "pattern": "record/view/${storage_id}"
    }
  },
  {
    "label": "Date Modified",
    "property": "date_object_modified"
  },
  {
    "label": "Date Created",
    "property": "date_object_created"
  },
  {
    "label": "Chief Investigator",
    "property": "contributor_ci.text_full_name"
  }
  ]
},
"workspaces": {
  "title": "List workspace records",
  "solr_query": "metaMetadata_type:workspace",
  "filter": {
    "type": "date-range",
    "property": "date_object_modified",
    "message": "Filter by date modified"
  },
  "columns": [
    {
    "label": "Id",
    "property": "storage_id",
    "show": false
  },
  {
    "label": "Title",
    "property": "title",
    "link": {
        "pattern": "record/view/${storage_id}"
    }
  },
  {
    "label": "Date Modified",
    "property": "date_object_modified"
  },
  {
    "label": "Date Created",
    "property": "date_object_created"
  }
  ]
},
};
