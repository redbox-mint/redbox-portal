The same Spec reviewer performed two bounded read-only follow-ups within R21;
these were not independent gate rounds.

At WSU `8679736`, both build image inputs were correctly required/forwarded,
the builder workdir/toolchain/unit entrypoint were correct, host install/compile
steps were removed and CI configuration was included. One objection remained:
`.dockerignore` excluded itself even though the builder's new CI contract test
reads that file. The reported 546 host tests did not establish builder context
completeness. No suite, Docker command, write or commit was performed by the
reviewer.

After the parent added a failing context assertion and WSU `1b9b1ac` removed
the self-exclusion, the reviewer read only `8679736..1b9b1ac` and returned:

> Accepted: `8679736..1b9b1ac` removes `.dockerignore` self-exclusion and adds
> assertions preserving both required context files. This closes my specific
> remaining objection.
>
> Read-only diff review only; no suites, Docker or edits. R21’s gate remains open
> because the round found two new A/P2 issues.

Exact task identifiers and retained command outputs are in
[review accounting](review-accounting.json).
