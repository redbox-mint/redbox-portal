In ReDBox, the `relatedTo` configuration allows for the establishment of relationships between different types of records. This feature is critical for linking associated data, ensuring coherence and navigability within the platform, and facilitating richer data management workflows.

## Overview of `relatedTo`

The `relatedTo` attribute defines how different record types are connected within the system. For example, a data management plan (DMP) record might be related to multiple data records, or a publication record could be related to the dataset it references. By configuring these relationships, users can easily navigate between related records and maintain an organized data structure.

## Configuring `relatedTo`

The `relatedTo` configuration is defined within the `recordtype` settings for each specific record type. Here's how to structure your configuration:

```javascript
module.exports.recordtype = {
  "rdmp": {
    // Other rdmp configurations...
    "relatedTo": [
      {
        "recordType": "dataRecord",
        "foreignField": "metadata.rdmp.oid"
      }
    ]
  },
  "dataRecord": {
    // Other dataRecord configurations...
    "relatedTo": [
      {
        "recordType": "rdmp",
        "localField": "metadata.rdmp.oid",
        "foreignField": "oid"
      },
      {
        "recordType": "dataPublication",
        "foreignField": "metadata.dataRecord.oid"
      }
    ]
  },
  // Additional record types and configurations...
};
```

### Key Parameters in `relatedTo`

- **`recordType`**: Specifies the type of record that the current record type is related to. This should match the key used in the configuration of the related record type.

- **`localField`**: (Optional) The field within the current record that links to the related record. If omitted, the system assumes the records oid.

- **`foreignField`**: The field within the related record that corresponds to the ID or unique identifier in the current record.

### Best Practices for Configuring Relationships

- **Explicit Definition**: Clearly define the relationship paths between records to avoid confusion and ensure accurate linkage.

- **Consistency**: Maintain consistent naming conventions for `localField` and `foreignField` across different record types to facilitate understanding and maintenance.

- **Bidirectional Links**: Where applicable, define reciprocal relationships in the configurations of both related record types to enable bidirectional navigation.

- **Validation**: Implement validation checks to ensure that related records exist before allowing the creation or update of a record, enhancing data integrity.

- **Documentation**: Document each relationship within your configuration to provide context and understanding for future administrators and developers.

## Example Use Case

Consider a scenario where a Research Data Management Plan (RDMP) needs to be linked to associated Data Records. By configuring the `relatedTo` section within the RDMP's configuration, you can specify that each RDMP relates to multiple Data Records based on a shared identifier (e.g., the RDMP's OID). Conversely, within the Data Record configuration, you would reference back to the RDMP to complete the bidirectional link.

Through these configurations, ReDBox can automatically maintain these associations, providing seamless navigation between RDMPs and their respective Data Records, and ensuring coherent data management practices are upheld.

---

By properly configuring the `relatedTo` attribute, you enhance the ReDBox platform's ability to manage complex data relationships, supporting comprehensive research data lifecycle management. If there are specific scenarios or additional details relevant to your project's use of related records, those details can be added to further tailor the documentation.