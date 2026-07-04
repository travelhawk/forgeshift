# projects/

Every product built with this harness lives here, one directory per product, each with
its **own git repository** (created by `/kickoff`). The harness repo ignores this
directory except for this file.

Why own repos: independent history and releases, worktree isolation for the
feature-pipeline workflow, and you can move a product out of the harness at any time
without surgery.
