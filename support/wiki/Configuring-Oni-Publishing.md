# Configuring Oni Publishing

Oni publishing is configured per brand through the `oniPublishing` app-config key.
`OniService` no longer reads `sails.config.datapubs`.

## Storage

OCFL writes use `StorageManagerService` disks. Configure S3 credentials in
`sails.config.storage.disks`, then reference the disk from `oniPublishing`.

```js
storage: {
  disks: {
    oniPublic: {
      driver: 's3',
      config: {
        bucket: 'research-data-ocfl',
        region: 'ap-southeast-2',
        endpoint: 'https://s3.example.edu',
        forcePathStyle: true,
        visibility: 'private'
      }
    }
  }
}
```

```js
oniPublishing: {
  enabled: true,
  defaultSite: 'public',
  sites: {
    public: {
      enabled: true,
      label: 'Public OCFL',
      publicUrl: 'https://data.example.edu/publication',
      useCleanUrl: false,
      storage: {
        driver: 'flydrive',
        diskName: 'oniPublic',
        prefix: 'ocfl/public',
        rootPath: '/ocfl/public',
        workspacePath: '/ocfl-work/public',
        tempDir: '/tmp/oni-public',
        keyEncoding: 'flydrive'
      }
    }
  }
}
```

## Migration

Move existing `datapubs.rootCollection`, `datapubs.metadata`, and `datapubs.sites`
values into `oniPublishing`. The renamed fields are:

- `sites.<name>.url` -> `sites.<name>.publicUrl`
- `sites.<name>.dir` -> `sites.<name>.storage` when using Flydrive. `storage` is an object, not the old path string: set `driver`, `diskName`, `rootPath`, `workspacePath`, optional `prefix`, and optional `keyEncoding`; see the full Flydrive example above.
- `metadata.html_filename` -> `metadata.htmlFilename`
- `metadata.jsonld_filename` -> `metadata.jsonldFilename`
- `metadata.datapub_json` -> `metadata.datapubJson`
- `metadata.identifier_namespace` -> `metadata.identifierNamespace`
- `metadata.render_script` -> `metadata.renderScript`
- `metadata.related_works` -> `metadata.relatedWorks`
- `metadata.DEFAULT_IRI_PREFS` -> `metadata.defaultIriPrefs`
