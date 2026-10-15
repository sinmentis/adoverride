# Security policy

## Supported versions

Only the latest [release](https://github.com/sinmentis/adoverride/releases) gets
security fixes.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through
[GitHub security advisories](https://github.com/sinmentis/adoverride/security/advisories/new).

Include the version, browser, steps to reproduce, and what an attacker could do.
Leave out real work item content, organization URLs, and tokens. You should get
a reply within a week.

## Scope

ADOverride runs only on `dev.azure.com` and `*.visualstudio.com`. It has no
backend or telemetry and never writes work items. It reads form layout metadata
with your current ADO session and stores settings in local extension storage.

In scope:

- Code in this repository and the released Chrome ZIP.
- Anything that leaks ADO content or settings outside the browser.
- Anything that lets a page, import file or other extension run code or change
  work items through ADOverride.
- Permission or host-pattern problems in the manifest.

Out of scope: Azure DevOps itself, Chrome, and third-party ADO extensions.
