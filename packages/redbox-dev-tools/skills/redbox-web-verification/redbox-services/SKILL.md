---
name: 'Redbox Services'
description: 'Implement and extend ReDBox owned domains and application modules with explicit inputs.'
---

# ReDBox owned domains

Read `support/wiki/Services-Architecture.md` and `support/wiki/Redbox-Core-Types.md`
for supported classes, exported contracts and composition. Domains live in named
source folders under `packages/redbox-core/src` and receive repositories, logger,
configuration and collaborators explicitly. Extension modules declare their
requirements and bind factories through `RedboxExtension`.

Constructors remain offline. Initialization prepares state; activation starts
producers; quiesce refuses new work; drain awaits accepted work; close releases
owned resources. Preserve receiver binding when delegating lifecycle methods.
Access persistence through declared repository/service contracts and the owned
lifetime. Verify actual Mongo behavior for persistence changes.
