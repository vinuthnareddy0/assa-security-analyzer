# ASSA

ASSA is a bounded external web assessment tool. It collects DNS records and the HTTP/HTTPS home-page response for one authorized domain, saves the observations, and generates an evidence-based report that can be printed to PDF. The other workspace views use clearly marked sample data.

## Run locally

Use Node.js 22 or newer. Install with `pnpm install`, generate/build with `pnpm build`, and run with `pnpm start`. Apply the SQL files in `drizzle/` to the local D1 database before running API routes. The deployment binds D1 as `DB`.

## Scope

The designated sandbox `demo.testfire.net` can be assessed without DNS ownership verification. Other domains require a TXT record under `_assa-verify.<domain>`. The scanner checks public DNS A, AAAA, MX, and TXT records, fetches the root URL over HTTP and HTTPS, and evaluates response headers and redirect behavior. With explicit opt-in it also inspects up to three linked HTML pages on the same HTTPS host, without form submissions or credentials. It does not crawl, scan ports, inspect certificates, access repositories, test authentication, or exploit vulnerabilities.

Run `node --test tests/scanner.test.mjs` to check domain filtering and finding generation.

## Team access

ASSA uses the Site's ChatGPT sign-in for real users. The deployment's `ASSA_ADMIN_EMAIL` environment variable identifies the owner who initializes the admin role. An admin adds tester and client email addresses in **Team workspace → People**. The site owner also shares the private Site with those addresses. Assessments and projects live in D1; clients see only projects assigned to their signed-in email and their associated reports. Testers see team work and update project progress. Admins review project requests, manage team members, and create projects.

The three example IDs on `/team` open a local demo role. They are not password accounts. Demo changes remain in that browser's storage and never reach production project records.

Project status changes, assessment starts, completions, and failures are recorded as timeline events. A completed run linked to a project appears in its assigned client view. Live reports include scope, method, observed pages, timestamps, evidence, and a printable summary.
