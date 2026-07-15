#!/usr/bin/env bash
# forge-pr.sh — deterministic PR assembly for /feature and /forge.
#
# push -> PR -> merge is fixed plumbing: the exact flags (--head so the session checkout
# stays on main, --base, squash + delete-branch on merge) are the same every time and a
# single wrong flag is a broken integration. Centralizing them here keeps the skills from
# drifting and lets their prose shrink to one call. Run with cwd inside the product repo.
#
# Base branch defaults to `main`; override with FORGE_BASE=master (etc.) for products that
# use a different trunk.
#
# Usage:
#   forge-pr.sh push   <branch>
#   forge-pr.sh create <branch> <title> <body-file>   # stdout: the PR URL
#   forge-pr.sh open   <branch> <title> <body-file>    # push + create in one step
#   forge-pr.sh merge  <number|url|branch>             # squash-merge + delete the branch
set -eu

base="${FORGE_BASE:-main}"
sub="${1:-}"; [ "$#" -gt 0 ] && shift || true

need_body() { [ -f "$1" ] || { echo "forge-pr: body file not found: $1" >&2; exit 1; }; }

case "$sub" in
  push)
    branch="${1:?push needs <branch>}"
    git push -u origin "$branch"
    ;;
  create)
    branch="${1:?create needs <branch>}"; title="${2:?create needs <title>}"; body="${3:?create needs <body-file>}"
    need_body "$body"
    gh pr create --head "$branch" --base "$base" --title "$title" --body-file "$body"
    ;;
  open)
    branch="${1:?open needs <branch>}"; title="${2:?open needs <title>}"; body="${3:?open needs <body-file>}"
    need_body "$body"
    git push -u origin "$branch"
    gh pr create --head "$branch" --base "$base" --title "$title" --body-file "$body"
    ;;
  merge)
    ref="${1:?merge needs <number|url|branch>}"
    gh pr merge "$ref" --squash --delete-branch
    ;;
  *)
    echo "usage: forge-pr.sh {push <branch> | create <branch> <title> <body-file> | open <branch> <title> <body-file> | merge <ref>}" >&2
    exit 2
    ;;
esac
