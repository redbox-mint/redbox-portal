module.exports.recordtype = {
  "rdmp": {
    searchFilters: [
      {
        name: "text_title",
        title: "search-refine-title",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "text_description",
        title: "search-refine-description",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "grant_number_name",
        title: "search-refine-grant_number_name",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "finalKeywords",
        title: "search-refine-keywords",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "workflow_stageLabel",
        title: "search-refine-workflow_stageLabel",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      }
    ]
  }
};
