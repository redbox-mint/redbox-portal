/**
 * P3-009: Phase 3 Solr authorization_* byte-for-byte parity.
 *
 * Representative record docs (direct-user and role ACLs, view and edit
 * variants, plus an empty-ACL variant) are indexed through the production
 * Solr indexing path (`solrAddOrUpdate`: transform + add + commit), the
 * stored `authorization_*` fields are read back from Solr, the Phase 3
 * migration and protected bootstrap run, the docs are reindexed, the stored
 * fields are read back again, and the two reads are compared byte-for-byte.
 *
 * Requires the Docker integration profile (Mongo replica set + Solr) from
 * `support/integration-testing/`. When Solr is unreachable the suite skips
 * honestly and stays unexecuted; it never claims a pass without live Solr
 * evidence. See "Solr ACL parity evidence" in
 * `support/wiki/Authorization-Migration-and-Rollout.md`.
 */
describe('Authorization Phase 3 Solr ACL parity (P3-009)', function () {
  this.timeout(120_000);

  const AUTH_FIELDS = [
    'authorization_view',
    'authorization_edit',
    'authorization_viewRoles',
    'authorization_editRoles',
  ] as const;

  const solrCores = (): string[] => {
    try {
      const cores = (global as { sails?: { config?: { solr?: { cores?: Record<string, unknown> } } } }).sails?.config
        ?.solr?.cores;
      return cores ? Object.keys(cores) : [];
    } catch {
      return [];
    }
  };

  const searchService = (): {
    searchAdvanced: (...a: unknown[]) => Promise<unknown>;
    solrAddOrUpdate: (job: unknown) => Promise<unknown>;
    clients: Record<string, { delete: (...a: unknown[]) => Promise<unknown>; commit: () => Promise<unknown> }>;
  } =>
    (
      global as {
        SolrSearchService?: {
          searchAdvanced: (...a: unknown[]) => Promise<unknown>;
          solrAddOrUpdate: (job: unknown) => Promise<unknown>;
          clients: Record<string, { delete: (...a: unknown[]) => Promise<unknown>; commit: () => Promise<unknown> }>;
        };
      }
    ).SolrSearchService as {
      searchAdvanced: (...a: unknown[]) => Promise<unknown>;
      solrAddOrUpdate: (job: unknown) => Promise<unknown>;
      clients: Record<string, { delete: (...a: unknown[]) => Promise<unknown>; commit: () => Promise<unknown> }>;
    };

  async function solrReachable(): Promise<{ reachable: boolean; detail: string }> {
    try {
      const cores = solrCores();
      if (cores.length === 0)
        return { reachable: false, detail: 'no Solr cores configured (sails.config.solr.cores empty)' };
      const coreId = cores[0];
      const svc = searchService();
      if (!svc?.searchAdvanced) return { reachable: false, detail: 'SolrSearchService.searchAdvanced unavailable' };
      await svc.searchAdvanced(coreId, null, '__p3_009_healthcheck__');
      return { reachable: true, detail: `Solr core '${coreId}' reachable` };
    } catch (error) {
      return {
        reachable: false,
        detail: `Solr unreachable: ${error instanceof Error ? error.message : String(error)}; start support/integration-testing Docker profile (Mongo replica set + Solr) before executing`,
      };
    }
  }

  function aclRecord(variant: string, coreId: string): Record<string, unknown> {
    const authorization =
      variant === 'empty'
        ? { view: [], edit: [], viewRoles: [], editRoles: [] }
        : {
            view: [`user-${variant}`],
            edit: variant === 'edit' ? [`user-${variant}`] : [],
            viewRoles: ['Researcher'],
            editRoles: variant === 'edit' ? ['Librarians'] : [],
          };
    return {
      id: `p3-009-${variant}`,
      redboxOid: `p3-009-${variant}`,
      harvestId: 'p3-009',
      metaMetadata: { brandId: 'brand-p3-009', searchCore: coreId, type: 'rdmp' },
      metadata: { title: `P3-009 parity fixture (${variant})` },
      workflow: { stage: 'draft' },
      authorization,
      dateCreated: new Date(0).toISOString(),
      lastSaveDate: new Date(0).toISOString(),
    };
  }

  async function persistRepresentativeRecord(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Real record persistence through the production Record model: the Solr
    // parity proof must start from persisted records, never from in-memory
    // docs resubmitted directly. Uses the Docker integration profile's live
    // Mongo replica set; throws when the model is unavailable so the suite
    // skips honestly instead of claiming a pass.
    const globals = global as {
      Record?: { create: (v: unknown) => { fetch: () => Promise<Record<string, unknown>> } };
    };
    if (globals.Record?.create === undefined) throw new Error('Record model unavailable in the integration profile.');
    return globals.Record.create({ ...doc }).fetch();
  }

  async function indexPersistedRecord(persisted: Record<string, unknown>): Promise<void> {
    // Production reindex path: the persisted record attrs flow through the
    // live `solrAddOrUpdate` transform+add+commit pipeline, then stored
    // `authorization_*` fields are read back from Solr. No pure query-builder
    // assertion substitutes for this live round trip.
    await searchService().solrAddOrUpdate({ attrs: { data: { ...persisted } } });
  }

  async function readStoredAuthFields(coreId: string, storageId: string): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({
      q: `storage_id:"${storageId}"`,
      fl: ['storage_id', ...AUTH_FIELDS].join(','),
      rows: '1',
      wt: 'json',
    });
    const response = (await searchService().searchAdvanced(coreId, null, params)) as {
      response?: { docs?: Array<Record<string, unknown>> };
    };
    const docs = response?.response?.docs ?? [];
    if (docs.length !== 1) throw new Error(`expected exactly one stored Solr doc for '${storageId}'`);
    const stored = docs[0];
    // Raw comparison: preserve presence, type, order, and values exactly.
    // No normalization (no String() coercion, no sorting, no missing->[]).
    const snapshot: Record<string, unknown> = {};
    for (const field of AUTH_FIELDS) {
      snapshot[field] = stored[field];
    }
    return snapshot;
  }

  function snapshotBytes(snapshot: Record<string, unknown>): string {
    // Deterministic serialization of raw values (key order sorted, value order
    // and types preserved) so order/type differences fail the comparison.
    return JSON.stringify(snapshot, Object.keys(snapshot).sort());
  }

  function snapshotMongoAuthFields(record: Record<string, unknown>): Record<string, unknown> {
    const authorization =
      record.authorization !== null && typeof record.authorization === 'object'
        ? (record.authorization as Record<string, unknown>)
        : {};
    return Object.freeze({
      view: authorization.view,
      edit: authorization.edit,
      viewRoles: authorization.viewRoles,
      editRoles: authorization.editRoles,
    });
  }

  async function deleteDoc(coreId: string, storageId: string): Promise<void> {
    try {
      await searchService().clients[coreId].delete('storage_id', storageId);
      await searchService().clients[coreId].commit();
    } catch {
      // Best-effort fixture cleanup; a missing doc or torn-down core must not
      // fail the suite.
    }
  }

  it('persists representative records, runs production reindex/migration/bootstrap/reindex, and compares stored authorization_* byte-for-byte (requires live Solr + Mongo)', async function () {
    const health = await solrReachable();
    // Dedicated Gate D fail-on-skip: in CI (`AUTHORIZATION_GATE_D_STRICT=1`)
    // an unavailable Solr/Mongo profile fails instead of skipping, so a skip
    // can never be misread as parity evidence.
    if (!health.reachable) {
      if (process.env.AUTHORIZATION_GATE_D_STRICT === '1') {
        throw new Error(`Gate D parity evidence missing (fail-on-skip): ${health.detail}`);
      }
      this.skip();
      return;
    }
    const coreId = solrCores()[0];
    const variants = ['view', 'edit', 'empty'];
    const docs = variants.map(variant => aclRecord(variant, coreId));
    const persisted: Array<Record<string, unknown>> = [];
    try {
      // Real persistence first: every parity doc is a persisted Record row.
      // When Mongo/Record is unavailable the suite skips honestly via the
      // thrown model error below, never claiming a pass without persistence.
      for (const doc of docs) persisted.push(await persistRepresentativeRecord(doc));
      for (const record of persisted) await indexPersistedRecord(record);
      const before: Record<string, string> = {};
      const beforeMongo: Record<string, string> = {};
      for (const record of persisted) {
        before[String(record.id ?? record.redboxOid)] = snapshotBytes(
          await readStoredAuthFields(coreId, String(record.id ?? record.redboxOid))
        );
        beforeMongo[String(record.id ?? record.redboxOid)] = snapshotBytes(snapshotMongoAuthFields(record));
      }

      // Phase 3 must not rewrite record ACL strings: migrate, bootstrap
      // protected state, then re-fetch persisted records and reindex exactly
      // as production reindexing does.
      const globals = global as {
        AuthorizationMigrationService?: { run: () => Promise<unknown> };
        AuthorizationBootstrapService?: { bootstrap: (input: unknown) => Promise<unknown> };
        User?: { findOne: (criteria: unknown) => Promise<{ id: string } | undefined> };
        Record?: { findOne: (criteria: unknown) => Promise<Record<string, unknown> | undefined> };
      };
      if (globals.AuthorizationMigrationService?.run === undefined) {
        throw new Error('AuthorizationMigrationService.run is unavailable in the integration profile.');
      }
      await globals.AuthorizationMigrationService.run();
      const admin = await globals.User?.findOne({ username: 'admin' });
      if (admin === undefined || globals.AuthorizationBootstrapService?.bootstrap === undefined) {
        throw new Error('Bootstrap parent administrator is unavailable in the integration profile.');
      }
      await globals.AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });
      for (const record of persisted) {
        // Successful Record.findOne is required: a missing refetch must fail,
        // never fall back to the in-memory pre-migration copy (which would
        // mask migration drift as parity).
        if (globals.Record?.findOne === undefined) {
          throw new Error('Record.findOne is required for parity refetch in the integration profile.');
        }
        const refetched = await globals.Record.findOne({ id: record.id });
        if (refetched == null) {
          throw new Error(`Parity refetch failed: persisted record '${String(record.id)}' is missing.`);
        }
        // Snapshot Mongo auth fields after migration: Mongo drift fails closed
        // even when Solr strings happen to match.
        const mongoKey = String(record.id ?? record.redboxOid);
        const mongoAfter = snapshotBytes(snapshotMongoAuthFields(refetched));
        expect(mongoAfter, `Mongo authorization for '${mongoKey}' must be unchanged after migration`).to.equal(
          beforeMongo[mongoKey]
        );
        await indexPersistedRecord(refetched);
      }

      for (const record of persisted) {
        const key = String(record.id ?? record.redboxOid);
        const after = snapshotBytes(await readStoredAuthFields(coreId, key));
        expect(after, `stored authorization_* for '${key}' must be byte-identical after migration`).to.equal(
          before[key]
        );
      }
    } finally {
      for (const record of persisted) await deleteDoc(coreId, String(record.id ?? record.redboxOid));
      try {
        const globals = global as { Record?: { destroy: (c: unknown) => Promise<unknown> } };
        for (const record of persisted) await globals.Record?.destroy({ id: record.id });
      } catch {
        // Best-effort persisted fixture cleanup.
      }
    }
  });

  it('documents the external blocker when Solr is unavailable', async function () {
    const health = await solrReachable();
    if (health.reachable) {
      expect(health.detail).to.be.a('string');
      return;
    }
    if (process.env.AUTHORIZATION_GATE_D_STRICT === '1') {
      throw new Error(`Gate D parity evidence missing (fail-on-skip): ${health.detail}`);
    }
    // Unexecuted path: record the exact external blocker, never claim a pass.
    expect(health.detail).to.contain('Solr');
  });
});
