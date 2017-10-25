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
            "pattern": "view/${storage_id}"
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
  }
};
