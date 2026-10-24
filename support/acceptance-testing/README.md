# Browser acceptance

Use `npm run test:playwright:ci` from the repository root for the complete v6
browser suite, or `npm run test:playwright` for the mounted development workflow.
This directory's Compose entry now includes that same maintained stack.

The old Groovy/Selenium source remains for historical reference. It targeted the
separate, pre-v5 DLCF images and is not a v6 qualification suite. Its original
Compose definition is preserved in
[retirement evidence](../specs/sails-retirement/evidence/legacy-acceptance-compose.yml).
The maintained browser tests and their assertions are unchanged by this redirect.
