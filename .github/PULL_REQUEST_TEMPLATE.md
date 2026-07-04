<!--
  PR title format: [ISD-##] Short description   (e.g. [ISD-42] Add house routes)
  Or put the ticket ID in your branch name      (e.g. feat/isd-42-house-routes)
  CI will fail if neither contains an ISD-## ticket ID.
-->

## What does this PR do?

<!-- Short summary: what changed and why. Screenshots welcome if relevant. -->

## How to test

<!-- Steps for the reviewer to verify this works. -->

## Checklist

- [ ] Linear ticket ID (`ISD-##`) is in the PR title or branch name
- [ ] `bun run dev` starts with no errors
- [ ] `bun run build` completes with no errors
- [ ] `bun run typecheck` passes
- [ ] Database schema changed? Ran `bun run db:generate` and committed the migration (skip if no schema change)
- [ ] Self-reviewed my own diff (no leftover `console.log`, commented-out code, or unrelated changes)
- [ ] Updated `.env.example` if new environment variables were added
