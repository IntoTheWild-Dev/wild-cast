# Local security and print validation rollout

This branch is not production approval. Identify V2's exact source and compare
its workflow before applying this branch there. Do not overwrite V2 blindly.

## Changes requiring coordinated rollout

- Configure a private, stable `OWNER_ID_SECRET` of at least 32 characters.
  Use a separate `REVIEW_LINK_SECRET` of at least 32 characters if review-link
  rotation should be independent of shared-owner identities. Never commit them.
- Existing account passwords remain valid. Old unbounded sessions require one
  fresh sign-in; new sessions expire after seven days and store only hashes.
  Account paths migrate on login. Test existing accounts/folders against a
  staging copy before any production migration; keep originals recoverable.
- Ordinary partner self-registration and signed-in shared Designs access remain
  available. Team-domain first claims/upgrades require the private invite code;
  an allowlisted email alone does not prove mailbox ownership.
- Old review URLs containing only a design ID no longer grant anonymous access.
  Signed-in users can regenerate a seven-day project-scoped review link.
  Design-card previews also use signed URLs. Reissue active external reviews
  before rollout; expired links need a new link or sign-in.
- The UI's Designer/Manager switch is not a server role. The intended approval
  policy needs an explicit decision before claiming role authorization is closed.
- Update the Figma plugin alongside the API. The plugin now asks for an existing
  designer/agency account and retains the session only in plugin memory.
  Static plugin credentials are no longer embedded in its source. Legacy keys
  are rejected unless `ALLOW_LEGACY_PLUGIN_KEY=1` is explicitly configured for
  migration. Remove that switch and rotate/revoke the historical key.
- Configure the existing agency invite code privately. Email verification and
  individually issued expiring invites remain stronger alternatives to a shared
  team invite; no mailbox verification service has been provisioned here.
- Sign-in/registration requests have an atomic 60-per-15-minute IP limit in
  addition to per-account failed-password lockout. On Vercel the limiter trusts
  only its platform `x-vercel-forwarded-for` header; elsewhere it uses the
  direct socket. A missing trusted address or broken storage fails closed in
  production. Confirm your proxy topology and configure platform bot/WAF limits
  for distributed abuse and expensive signed-in APIs.
- Raster library uploads are decoded and emitted as sRGB PNG; SVG/HTML disguised
  as images are rejected. Validate representative transparent logos and CMYK
  source-photo colour handling in the actual browser before rollout.

## Composed print QA

See `scripts/PRINT_QA.md`. With `REQUIRE_COMPOSED_PRINT_QA=1`, a healthy
authenticated worker is mandatory for CMYK downloads. The included HTTP server
is localhost-only for testing; it is not a public hosting solution. Production
needs HTTPS, resource/time/concurrency limits, an operational health check and
the exact approved ICC files. The worker authenticates requests and binds the
report to the final PDF bytes and selected ICC. Do not point it at an arbitrary
third-party service: it receives the exported artwork.

The new build emits public `release.json` with repository, commit, branch,
dirty status and build time so future deployments can be identified. A dirty
build is not an exact clean-commit attestation. This cannot retroactively
identify the current V2 deployment.

## Before calling the application secure or print-ready

Complete authenticated staging/browser/Figma tests, approval-policy verification,
platform permissions/headers/storage configuration review, safe credential
rotation and access-log review. No prior compromise is assumed or ruled out.
Obtain the fresh matching reference, printer ICC/settings, artwork dimensions,
asset revision and font clearance. Run the controlled print comparison. Exact
C75 M0 Y10 K0 values do not establish a physical match to the approved old blue.

IP header source: https://vercel.com/docs/headers/request-headers
