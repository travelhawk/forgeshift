#!/usr/bin/env bash
# forge-worktree.sh — deterministic git-worktree lifecycle for feature-pipeline.
#
# Why this exists: the pipeline's build/verify agents used to run raw `git worktree
# add/prune/remove` and invent a "collision-proof suffix" by hand — deterministic shell
# work handed to a probabilistic agent (a failure source AND ~40% of each prompt). This
# script owns that plumbing so an agent calls one line and the shell owns correctness.
#
# The workflow runtime cannot generate this itself: Date.now()/Math.random() are banned
# in workflow scripts (they break deterministic replay/resume), so the suffix entropy has
# to live in the shell — PID + epoch-seconds + $RANDOM, unique across concurrent and
# repeated runs, all digits/hyphens so it is a valid git ref and path component.
#
# Run it with cwd inside the target repo (any worktree of it) — every git op is anchored
# to that repo's MAIN worktree, so the script's own on-disk location is irrelevant (it can
# live in the harness while operating on a product under projects/). Machine-readable
# KEY=VALUE lines go to stdout so a caller can `eval "$(forge-worktree.sh new-build 3)"`;
# human diagnostics go to stderr.
#
# Usage:
#   forge-worktree.sh new-build <index>              -> stdout: BRANCH=..  WORKTREE=..
#   forge-worktree.sh new-detached <role> <index> <branch>  -> stdout: WORKTREE=..
#   forge-worktree.sh clean <worktree-path>          -> stdout: CLEANED=..
set -eu

sub="${1:-}"; [ "$#" -gt 0 ] && shift || true

# Absolute path of the repo's MAIN worktree. `git worktree list` works from any linked
# worktree; the first entry is always the main one. No pipefail (head closing the pipe
# early would otherwise trip `set -e` via SIGPIPE).
root() {
  git worktree list --porcelain 2>/dev/null | awk '/^worktree /{sub(/^worktree /, ""); print; exit}'
}

suffix() { echo "$(date +%s)-$$-${RANDOM}"; }

ROOT="$(root)"
[ -n "$ROOT" ] || { echo "forge-worktree: not inside a git repository (cd into the target repo first)" >&2; exit 1; }
git -C "$ROOT" worktree prune 2>/dev/null || true

case "$sub" in
  new-build)
    idx="${1:?new-build needs <index>}"
    sfx="$(suffix)"
    branch="feature/wf-${idx}-${sfx}"
    wt="$(dirname "$ROOT")/wf-build-${idx}-${sfx}"
    git -C "$ROOT" worktree add -b "$branch" "$wt" 1>&2
    echo "BRANCH=${branch}"
    echo "WORKTREE=${wt}"
    ;;
  new-detached)
    role="${1:?new-detached needs <role>}"; idx="${2:?new-detached needs <index>}"; branch="${3:?new-detached needs <branch>}"
    sfx="$(suffix)"
    wt="$(dirname "$ROOT")/wf-${role}-${idx}-${sfx}"
    git -C "$ROOT" worktree add --detach "$wt" "$branch" 1>&2
    echo "WORKTREE=${wt}"
    ;;
  clean)
    wt="${1:?clean needs <worktree-path>}"
    git -C "$ROOT" worktree remove --force "$wt" 2>/dev/null || true
    git -C "$ROOT" worktree prune 2>/dev/null || true
    echo "CLEANED=${wt}"
    ;;
  *)
    echo "usage: forge-worktree.sh {new-build <index> | new-detached <role> <index> <branch> | clean <path>}" >&2
    exit 2
    ;;
esac
