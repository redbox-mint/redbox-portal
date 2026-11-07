# HTTP logging failure ownership

Round-9 FM-016 orchestrator decision (2026-11-07), supplementing
[the agreed design](design.md#7-request-context-and-execution-order). This supersedes
the automatic recovery described in the round-7 and round-8 evidence.

The Fastify composition observes concrete logging destinations, supplied explicitly
for external loggers or retained by the shared logger's additive destination hook;
it must not discover them through private Pino symbols. Destination error/close
events and failed state latch HTTP logging as degraded until operator restart.
Subsequent diagnostics are dropped and counted, with only rate-limited fixed-code
stderr fallback. Status and health expose degradation and counters; logging loss
does not fail readiness. There is no automatic reopen, replacement logger, recovery
probe or replay queue. Accepted asynchronous sink work remains owned through
settlement under the application/request drain and caller stop deadlines. The host
does not close or await closure of borrowed destinations, including failed file
opens. Shared logger formatting, levels and Express behavior remain unchanged.
