# Integration patches

This feature is based on the admin-design stack. The GraphQL implementation lives on
its parent branch (verified at `570c34d28`), so changes to those absent files are
retained here for integration rather than copied into this branch as partial services.

Combine this branch with the GraphQL parent, then apply these patches in order:

1. `record-graphql-uon-compatibility.patch`: namespaced metadata index mappings and
   bounded catalogue fingerprints. The shared fingerprint helper and its tests are
   already included directly in this feature branch and are excluded from this patch.
2. `record-graphql-complex-fields.patch`: complete declared repeated-group selections.
3. `record-graphql-single-object-fields.patch`: object selections and duplicate
   presentation handling, preserving standalone read fields and private restrictions.

`uon-chief-investigator-carrier.patch` applies separately to the UON hook. It removes
one redundant scalar carrier that conflicts with the declared chief-investigator
object. The local UON environment uses a compiled overlay; its hook checkout is clean.

These patches were reviewed and tested against the combined runtime. Check application
against the current parent before integration; later parent changes can require context
adjustments. See ../VERIFICATION.md for test and browser evidence.
