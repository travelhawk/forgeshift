---
name: harden
description: Security and robustness pass - full audit by the security specialist plus a robustness sweep (boundary validation, failure modes, secrets hygiene, rate limiting), then fixes with approval. Use before first public exposure and after auth, payment, or data-model changes.
argument-hint: "[optional scope, e.g. auth flow only]"
---

# /harden — Security + robustness pass

Scope: $ARGUMENTS (default: the whole project, prioritized by exposure).

## 1. Audit

Delegate to `forge-warden` with the scope, what the app does, and where the sensitive
surfaces are (auth, payments, uploads, admin). It returns confirmed findings with attack
paths and a "needs a second look" list.

In parallel, run a robustness sweep yourself or via a second agent:

- Boundary validation: every external input (HTTP, CLI args, file uploads, webhooks)
  validated at entry — and ONLY there; no paranoia layers inside.
- Failure modes: what happens when the DB is down, the third-party API times out, the
  disk is full? Errors surface with actionable messages, no silent catch-and-continue.
- Secrets hygiene: `.env` gitignored with a committed `.env.example`; no secrets in
  client bundles; scan git history if the repo predates the harness. Work with **key
  names only** from `.env.example` — actual `.env` values are permission-denied by
  design; where a value must be checked (is it set in the deploy target?), ask the user.
- Abuse resistance where public: rate limiting on auth + expensive endpoints, upload
  size caps, pagination caps.

## 2. Triage with the user

Present findings by severity with the attack path in one sentence each. Proposal per
finding: fix now / accept risk (recorded) / needs design change (→ ADR). Criticals are
fix-now unless the user explicitly overrides — record that override in writing in
PROGRESS.md.

## 3. Fix

Fix approved findings through the normal quality loop — regression test that encodes
the attack (the test attacks, the fix defends), then the fix, then `forge-quench` on
the security-relevant diffs. Security fixes get review without exception.

## 4. Close

Report: findings fixed (with the test that now guards each), risks accepted (by whom),
second-look items and their resolution. Add a "hardened <date>, scope" line to
PROGRESS.md. Recommend re-running /harden after the next auth/payment/data-model change
— not on a timer.
