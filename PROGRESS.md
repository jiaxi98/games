# PROGRESS

This file stores lessons learned, issues, fixes, and prevention rules.
Rule: whenever a problem occurs, record:
- What happened
- How it was solved
- How to prevent recurrence
- Related git commit

## Entry Template
### [YYYY-MM-DD] Title
- Problem:
- Solution:
- Prevention:
- Commit: `<hash>`

## Entries

### [2026-02-15] Worktree move failed across devices
- Problem: moving worktree from `/tmp/personal-os-worktree` to `/home/aiops/zhaojx/projects/personal-os-worktree` failed with `Invalid cross-device link`.
- Solution: created a new worktree directly at target path and then removed the old temporary worktree.
- Prevention: when path crosses filesystems, avoid `git worktree move`; instead create target worktree directly and clean old one with `git worktree remove --force` after verification.
- Commit: `TBD (will be filled after docs bootstrap commit)`

### [2026-02-15] Worktree removal blocked by local modifications
- Problem: `git worktree remove /tmp/personal-os-worktree` failed because of modified/untracked files.
- Solution: user approved cleanup; removed with `git worktree remove --force`.
- Prevention: check `git status` in temporary worktrees before removal; if disposable, use `--force` only with explicit user approval.
- Commit: `TBD (will be filled after docs bootstrap commit)`
