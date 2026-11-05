# Deferred: mock features without backend support

These features appear in the mocks but need backend work (new data, endpoints or services). They're
**not** built in the redesign. Implementers add to this list when they find a feature the backend can't
support. Note the screen, the feature and what the backend would need.

Pure front-end features built from data the screen already receives (client-side filtering, previews,
colour-contrast checks, collapse/expand, chip inputs) are **not** deferred. Build them.

## Overview and navigation

| Screen | Feature | Why deferred / backend needed |
|---|---|---|
| Admin home | "Needs attention" list (e.g. Oni empty sections, banner off) | Needs a service that evaluates config health across app-configs |
| Admin home | Integration on/off badges and the "n of 5 integrations enabled" stat | Needs an endpoint that summarises each integration app-config's enabled state |
| Sidebar | Status tags (On / Check / Error) next to items | Same integration/config status summary as above |

## Records and reporting

Default RDMP modified-date mapping corrected on `admin-deferred/16-polish` in both bootstrap report definitions. The normal bootstrap path also repairs unchanged stock saved copies, guarded by their update timestamp. Customized reports remain installation-owned: change their Date Modified property to `lastSaveDate` using the report editor if they still reference `dateModified`.

| Screen | Feature | Why deferred / backend needed |
|---|---|---|

## People and access

Authorized-rule case normalization delivered on `admin-deferred/15-auth-domain-case`; account-creation-only restrictions and exact-domain policy remain unchanged.

| Screen | Feature | Why deferred / backend needed |
|---|---|---|

## Site and content

| Screen | Feature | Why deferred / backend needed |
|---|---|---|

## Lookups and vocabularies

| Screen | Feature | Why deferred / backend needed |
|---|---|---|
| Figshare vocabularies | Change an existing source's scope (partial) | Source names, archive state and manual/daily/weekly schedules delivered on `admin-deferred/12-lookups`. Scope remains read-only because it identifies the remote mirror and approved crosswalks; changing it needs an explicit identity migration policy. Discovery can add a source with another scope. |

## Integrations

| Screen | Feature | Why deferred / backend needed |
|---|---|---|
