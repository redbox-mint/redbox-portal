In ReDBox, the `searchFilters` configuration plays a pivotal role in defining and customizing the search experience. Beyond affecting search queries, this configuration directly influences the rendering of facets and other filters on the search page, enabling users to narrow down their search results based on specific criteria.

## Understanding `searchFilters` Configuration

The `searchFilters` setup within each `recordtype` allows you to tailor the search interface to the unique needs of each record type, such as research datasets, publications, or data management plans. These configurations determine which filters and facets are available to users and how they interact with the data.

## Configuring `searchFilters`

When configuring `searchFilters`, you're essentially mapping your data model to the search interface. Each filter corresponds to a field in your records and determines a facet or filter option on the search page:

```javascript
module.exports.recordtype = {
  "rdmp": {
    // Other configurations...
    "searchFilters": [
      {
        "name": "text_title",
        "title": "Title",
        "type": "exact",
        "typeLabel": "Contains",
        "facet": true
      },
      // Additional search filters...
    ]
  },
  // Define other record types as needed...
};
```

### Key Attributes for Facets and Filters

- **`name`**: This should match the field name in your Solr index. It's what links the filter on the UI to your data.

- **`title`**: The user-friendly name that will appear for this filter or facet on the search page.

- **`type`**: Defines the kind of filter; common types include `facet` for categorizable data or `exact` for specific matches.

- **`typeLabel`**: Descriptive text that clarifies the filter action (e.g., "Contains", "Equals", etc.).

- **`facet`**: A boolean attribute that, when set to true, indicates that this filter should also render as a facet on the search page, allowing users to refine their search results based on the categories or values within that field.

### Best Practices for Effective Search Filters and Facets

- **User-Centric Configuration**: Select facets and filters that are most relevant and useful for your users' search needs. Avoid overloading the search page with too many options.

- **Consistency Across Record Types**: If multiple record types share similar fields, consider standardizing the filters and facets across these types for a consistent user experience.

- **Clear and Descriptive Labels**: Ensure `title` and `typeLabel` are clear and intuitive to help users understand what each filter or facet does.

- **Testing and Validation**: Regularly test the search functionality and facet behavior to ensure they accurately reflect the data and meet user expectations.

- **Solr Schema Alignment**: Ensure that your `searchFilters` configuration aligns with your Solr schema. The fields used for facets and filters must be correctly indexed in Solr.

## Example: Faceted Search for Research Datasets

If you want to enable users to refine research dataset searches by subject area, funding source, and publication year, you could configure your `searchFilters` like so:

```javascript
"searchFilters": [
  {
    "name": "subject_area",
    "title": "Subject Area",
    "type": "facet",
    "typeLabel": "Filter by"
  },
  {
    "name": "funding_source",
    "title": "Funding Source",
    "type": "facet",
    "typeLabel": "Filter by"
  },
  {
    "name": "publication_year",
    "title": "Publication Year",
    "type": "facet",
    "typeLabel": "Filter by"
  }
]
```

By thoughtfully configuring `searchFilters`, you enable users to conduct more effective and targeted searches, significantly enhancing the search and discovery process within the ReDBox platform.