# Development Workflow

This document defines the branch and pull-request workflow for this repository. The goal is to keep the integration branch stable, isolate unrelated work, and make changes reviewable.

## Branch roles

| Branch | Purpose | Rules |
| --- | --- | --- |
| `main` | Release and production baseline | Do not develop directly on this branch. Update it through a pull request from `develop`. |
| `develop` | Shared integration branch | Base for all topic branches. Merge completed topic branches here through pull requests. |
| `feature/<topic>` | New functionality or enhancements | One feature or coherent topic per branch. |
| `fix/<topic>` | Bug fixes | Keep the branch scoped to one bug or closely related set of defects. |
| `docs/<topic>` | Documentation-only changes | Use when the change does not modify application behavior. |
| `refactor/<topic>` | Behavior-preserving structural changes | Keep separate from feature work unless inseparable. |
| `test/<topic>` | Test-only changes | Use for test infrastructure or coverage work that can be reviewed independently. |

Use short, descriptive, lowercase kebab-case topic names. Do not reuse a branch for unrelated work.

## Standard workflow

1. Start from the latest `develop`:
   ```bash
   git switch develop
   git pull --ff-only origin develop
   ```
2. Create a new branch for the task:
   ```bash
   git switch -c feature/<topic>
   ```
   Choose the prefix that matches the work (`fix/`, `docs/`, `refactor/`, or `test/` as appropriate).
3. Keep commits focused on that topic. Do not mix unrelated cleanup, formatting, or opportunistic changes into the branch.
4. Before pushing, inspect the working tree and diff:
   ```bash
   git status --short
   git diff
   git diff --check
   ```
5. Push the topic branch and open a pull request targeting `develop`.
6. Run the relevant automated tests and checks. Record what was run and disclose any checks that could not be run.
7. After review and required checks pass, merge the pull request into `develop`.
8. When a release is ready, open a pull request from `develop` to `main`. Do not merge individual topic branches directly into `main`.

## Branch hygiene

- Create a separate branch for each independent topic. Do not continue long-term development on a single feature branch.
- Keep topic branches reasonably short-lived and synchronized with `develop` when necessary.
- Do not commit directly to `main` or `develop`, except for an explicitly agreed repository-maintenance operation.
- Do not force-push shared branches or rewrite their published history without explicit approval.
- Do not delete a branch until its changes are merged or intentionally abandoned.
- Before changing branches, check `git status`. Do not discard, overwrite, stash, or move uncommitted work without understanding its contents and obtaining approval where needed.
- If a branch has diverged, inspect both sides of the history before choosing merge, rebase, or cherry-pick. Never reset a shared branch merely to make the graph look linear.

## Pull-request expectations

A pull request should explain:

- The problem or requirement being addressed.
- The scope of the change and important implementation decisions.
- Any configuration, migration, deployment, or operational impact.
- Tests and checks performed, including results.
- Known limitations and follow-up work.

Keep each pull request focused. If a task reveals unrelated work, create a separate topic branch for it.

## AI-assisted development

AI agents and automated coding tools must follow the same branch rules as contributors:

- Confirm the repository, current branch, working-tree state, and task scope before editing.
- Start work from the latest `develop` by creating a new topic branch, unless the user explicitly requests another base.
- Do not switch branches, overwrite existing changes, amend published commits, or force-push without authorization.
- Modify only files needed for the requested topic. Ask before broad refactors or unrelated cleanup.
- Do not claim tests, builds, deployments, or merges succeeded unless their results were observed.
- In the completion report, list the branch, changed files, commits or pull request, checks performed, and any remaining risks or unverified behavior.

## Repository migration note

If this workflow is being introduced while the repository still lacks a `develop` branch, do not create `develop` from an outdated `main` or silently replace `main` with another branch. First reconcile the intended history, preserve commits unique to each branch, and verify that the integration pull request is mergeable. Create `develop` from the resulting updated `main` only after that integration has completed.
