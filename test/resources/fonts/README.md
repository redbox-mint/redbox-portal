# Branding typeface test fixtures

Real browser-loadable Roboto WOFF2 files from Fontsource packages, pinned at 5.3.0.
Distributed under the SIL Open Font License 1.1; see [OFL.txt](OFL.txt).

| Fixture                   | Source within package                                            |
| ------------------------- | ---------------------------------------------------------------- |
| test-font-regular.woff2   | @fontsource/roboto/files/roboto-latin-400-normal.woff2           |
| test-font-bold.woff2      | @fontsource/roboto/files/roboto-latin-700-normal.woff2           |
| test-font-italic.woff2    | @fontsource/roboto/files/roboto-latin-400-italic.woff2           |
| test-font-variable.woff2  | @fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2 |
| test-font-truncated.woff2 | First 50 bytes of regular; invalid                               |

Downloaded from `https://cdn.jsdelivr.net/npm/<package>@5.3.0/files/<filename>`.
License from `https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.3.0/LICENSE`.
The regular, bold and variable Bruno copies contain identical bytes.
Tests read checked-in bytes and never download fixtures.

The former filler containers were not valid fonts. They have been replaced;
header-only malformed fixtures are constructed only in rejection tests.
