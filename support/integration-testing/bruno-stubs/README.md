The Bruno general Compose stack uses this local HTTP fixture for DataCite DOI
lookups. Both portal profiles override only
`vocab.services.dataciteDois.options.baseUrl`; the real vocabulary controller,
DOI service, request construction and response mapping remain under test.
Production defaults continue to use `https://api.datacite.org`.

`GET /dois` accepts the search, paging, field selection and Accept header used
by `Search Service Lookup.bru`. It returns a synthetic DataCite JSON:API result
from `datacite-dois.json`. Unexpected requests return 404 and are logged so an
adapter regression cannot silently pass against an unconditional stub. The
service has a readiness endpoint at `/health` and publishes no host ports.
