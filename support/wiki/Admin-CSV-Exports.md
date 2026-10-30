# Background admin CSV exports

The **Export** page at `/:branding/:portal/admin/export` prepares CSV files in the background. Select a record type and optional modified-date bounds, choose CSV, and select **Prepare export**. Recent exports show queued, preparing, ready, failed, or expired status. A ready export has a normal browser download link. Preparation continues after navigating away; reopening the page restores the current user's recent exports.

This avoids keeping a download request open while the exporter scans records to discover all CSV columns. Fields appearing only on later records remain in the CSV. The existing JSON export and direct browser/REST download endpoints retain their previous behavior; direct CSV clients should still account for their proxy timeout.

## Storage configuration

Every artifact operation uses a named [StorageManager](Services-Architecture) disk. Select it with `record.export.background.diskName`; the name must exist in `storage.disks`. Export code uses the disk's streaming, metadata, listing, and deletion methods for both generation and retention cleanup.

Default settings:

```javascript
record: {
  export: {
    background: {
      diskName: 'exports',
      retentionHours: 24,
      maxRunMinutes: 60
    }
  }
}
```

The default `exports` disk uses private GridFS in the core Mongo datastore, with a separate `adminExports` bucket. Configure filesystem or S3 storage through the normal `storage.disks` settings instead. For example:

```javascript
storage: {
  disks: {
    exports: {
      driver: 'fs',
      config: {
        root: '/attachments/exports',
        visibility: 'private'
      }
    }
  }
}
```

For S3, select the existing S3 driver with the deployment's bucket, region, authentication, and private visibility. These settings belong in storage configuration. For multiple portal instances, every worker and download-serving instance needs access to the selected disk; a filesystem therefore requires a shared mount.

Each job records its disk name and artifact key before upload. Changing `diskName` affects new jobs; existing downloads and cleanup continue using their saved disk name. Keep old disk definitions and their contents available until those jobs have expired and cleanup has succeeded. Repointing an existing disk definition requires migrating its remaining objects or waiting for their removal.

Use positive numeric values for retention and execution limits. A missing or invalid disk, or public disk visibility, prevents export preparation with an explicit configuration error. The existing `record.export.maxRecords` setting controls the database page size, not the total export count.

## Retention and recovery

Successful completion sets `expiresAt` to completion time plus the configured retention period. Download access checks this timestamp on every request and returns HTTP `410 Gone` immediately after expiry, even before file deletion.

Downloading does not delete the file or restart the retention period. Use **Delete** on a finished export to remove it early. It disappears from recent exports and its status/download URLs return `404`. The server removes its artifact through the job's saved StorageManager disk; if storage is unavailable, maintenance retries while downloads remain blocked. Failed attempts keep any remaining cleanup grace period so an unfinished write cannot leave orphaned data. Deletion does not affect the source records. Deleted-job metadata is retained briefly for cleanup and repeated requests, then pruned.

An Agenda maintenance job runs approximately every five minutes on the Mongo queue backend. It expires completed exports, removes expired or abandoned artifacts through their recorded StorageManager disks, retries deletion failures, and eventually prunes terminal job metadata. Failed uploads are removed as part of failure handling. The GridFS driver records pending uploads before writing chunks so recovery can also find unfinished files after a worker restart. A database TTL index alone is insufficient because it cannot remove the stored artifact.

Generation has a separate execution deadline, defaulting to 60 minutes after a worker starts. Heartbeats keep the queue lock and running-job state alive through column discovery and writing. Interrupted or stale work becomes failed and can be prepared again from the page. Download interruption does not cancel generation or delete a completed export; the user can retry until expiry.

Run the ordinary Agenda workers for generation and the Mongo-backed maintenance schedule for cleanup. Configured worker concurrency is per process, so account for the total number of worker processes when sizing database and storage capacity.

## Access and data semantics

Jobs and downloads belong to the authenticated effective user, branding, and portal. Workers resolve the requester's current identity and roles and apply the existing record visibility filters. Downloads require the same owner and current export permission. If the effective identity or relevant brand roles change after generation, prepare a new export.

The file contains the authorized generation result. Downloading does not rescan every record's current permissions, and the two-pass scan of live records is not a transactionally consistent database snapshot. Private storage and short retention apply to the generated file throughout its lifetime.

## Troubleshooting

- **Queued:** check that Agenda workers are running and the configured queue is reachable.
- **Failed:** inspect the safe message on the export page and the server logs. Check disk availability, private visibility, database connectivity, and the execution deadline; prepare again after correcting the cause.
- **Expired:** prepare another export. Downloads are blocked at expiry even if a cleanup retry still has to remove the object.
- **Storage fills up:** verify the maintenance job is running, old disk definitions still resolve, and deletion credentials remain valid. Cleanup failures retain their artifact references for another attempt.
- **Direct CSV URL still times out:** use the admin page's background export flow. The old binary download contract remains available for compatibility.
