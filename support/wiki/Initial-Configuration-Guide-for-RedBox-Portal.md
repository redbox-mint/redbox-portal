# Initial configuration

V6 uses validated configuration modules selected with `REDBOX_APPLICATION_CONFIG`,
`REDBOX_ENVIRONMENT_CONFIG` and `REDBOX_LOCAL_CONFIG`. Start with the
[configuration guide](Configuration-Guide.md), which documents precedence,
accepted deployment/environment inputs, domain data and migration of retired
settings. Do not create `.sailsrc` or model/config shims.

Set `server.publicUrl`, root context and trusted origins explicitly; supply
datastore/session credentials through the supported deployment inputs. Keep
configuration and selected extension artifacts in the consistent upgrade backup.
Follow [installation](Installation-Guide.md), [index preparation](Persistence-Index-Preparation.md)
and the [upgrade/recovery procedure](../specs/sails-retirement/upgrade-recovery-v6.md).
Review [intentional client changes](V6-Client-Compatibility.md) before cutover.
