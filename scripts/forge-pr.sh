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
#   forge-pr.sh push     <branch>
#   forge-pr.sh create   <branch> <title> <body-file>   # stdout: the PR URL
#   forge-pr.sh open     <branch> <title> <body-file>    # push + create in one step
#   forge-pr.sh open-all <manifest>                       # batch a whole wave (see below)
#   forge-pr.sh merge    <number|url|branch>             # squash-merge + delete the branch
#
# open-all takes a manifest file, one feature per line, TAB-separated:
#     <branch>\t<title>\t<body-file>
# A wave's PRs are independent, so it pushes ALL branches in a single `git push` and then
# creates the PRs concurrently — turning N serial push+create round-trips into one push and
# a parallel fan-out. Merges are NOT batched (they serialize to move the base forward); use
# `merge` per PR in dependency order after this returns.
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
  open-all)
    manifest="${1:?open-all needs <manifest-file>}"
    [ -f "$manifest" ] || { echo "forge-pr: manifest not found: $manifest" >&2; exit 1; }
    # Pass 1: collect branches + validate every body file up front (fail before any push).
    branches=(); titles=(); bodies=()
    while IFS=$'\t' read -r br ti bf || [ -n "$br" ]; do
      [ -n "$br" ] || continue
      need_body "$bf"
      branches+=("$br"); titles+=("$ti"); bodies+=("$bf")
    done < "$manifest"
    [ "${#branches[@]}" -gt 0 ] || { echo "forge-pr: manifest is empty: $manifest" >&2; exit 1; }
    # One push for the whole wave.
    git push -u origin "${branches[@]}"
    # Create the PRs concurrently; collect each background job's exit so one failure fails
    # the batch (a lost PR must not pass silently).
    pids=(); rc=0
    for i in "${!branches[@]}"; do
      gh pr create --head "${branches[$i]}" --base "$base" --title "${titles[$i]}" --body-file "${bodies[$i]}" &
      pids+=("$!")
    done
    for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
    exit "$rc"
    ;;
  merge)
    ref="${1:?merge needs <number|url|branch>}"
    gh pr merge "$ref" --squash --delete-branch
    ;;
  *)
    echo "usage: forge-pr.sh {push <branch> | create <branch> <title> <body-file> | open <branch> <title> <body-file> | open-all <manifest> | merge <ref>}" >&2
    exit 2
    ;;
esac
