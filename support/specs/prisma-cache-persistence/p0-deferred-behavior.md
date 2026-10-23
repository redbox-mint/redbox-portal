# Deferred behavior changes — separate from the persistence pilot

These are recorded follow-up candidates, not authorized changes in P0 or silent
adjustments in later cache adapters. No external issue was opened.

1. **Falsy cache hits:** decide whether false, zero, empty string and null should
   count as local hits. Today each causes a persisted lookup. A change needs
   notification/null-reset and absent-vs-null requirements first.
2. **Expiry consistency:** decide whether the boundary should be inclusive,
   whether rehydrated memory should get remaining lifetime, and whether per-call
   TTL must persist. Today expiry is strictly greater than the global TTL,
   memory gets the full default TTL, and persisted rows have no per-entry TTL.
3. **Durability and competing writes:** define whether callers should await
   persistence, how write failures propagate, and whether retries/upsert/order
   guarantees are needed. Today set is void, memory-first and best-effort;
   find/create races can produce duplicate errors. Index remediation in P3 is
   an activation prerequisite, not a promise to make every concurrent set win.
4. **Expired row cleanup and notification resets:** decide retention/deletion
   policy explicitly. Ordinary expired rows remain, null/TTL-zero reset writes
   remain persisted, and notification state must not be presumed disposable.
5. **Atomic preview consumption:** decide on an atomic consume operation and
   its public errors separately. Current delete-after-read allows two readers;
   deletion errors supersede expiry and ETag 304 can consume a token. Do not
   change the four-operation repository to implement a fix incidentally.
6. **Preview route scope and typed config:** evaluate whether token fetching
   should verify route brand/portal, and add previewTtlSeconds to typed config
   in a separate change if wanted. Existing creation/history lookups are scoped;
   fetch is token-only. P0 records this distinction without changing behavior.
7. **Persistence value policy:** the planned strict JSON validation is an
   explicit pilot contract, unlike today's unknown input. Review hook values
   first and report unsupported stored BSON; never silently serialize or erase
   Date/Buffer/ObjectId/BigInt/functions/cycles/undefined members.

Future domain migrations also need independent decisions: reference/configuration,
users/relationships/transactions, record storage, GridFS, sessions and queues.
PostgreSQL feasibility/data migration is not established by the cache pilot.
