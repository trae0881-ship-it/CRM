# Adometa CRM Git Release Checklist

Date: 2026-11-02

## Current audit result

- [x] Branch is `main` and tracks `origin/main`.
- [x] Latest commit inspected: `373327e` (`Merge remote main into local main`).
- [x] Worktree is clean.
- [x] No modified files.
- [x] No untracked files.
- [x] `.env` is ignored and empty locally.
- [x] `.env.example` contains placeholders only.
- [x] No private-key pattern or live credential value found in the repository scan.
- [x] No merge conflict markers found.
- [x] `package-lock.json` is present.
- [x] Build output contains the generated `dist/.htaccess`.
- [ ] Staging verification completed.
- [ ] Production release approved.

## Files and changes

There are no current uncommitted modified or untracked files to stage. The release candidate is represented by the latest commit shown above. Before any future commit, inspect:

```powershell
& 'C:\Program Files\Git\bin\git.exe' status --short --branch
& 'C:\Program Files\Git\bin\git.exe' diff --check
& 'C:\Program Files\Git\bin\git.exe' diff --stat
```

Review every newly added migration, Edge Function, environment reference and generated artifact. Do not stage `.env`, credentials, service-role keys, provider secrets, private keys or local test logs.

## Safe commit sequence

1. Confirm the target branch and repository remote.
2. Review the complete diff and `git diff --check`.
3. Run `npm test`, `npm run lint`, `npm run build` and `npm audit --audit-level=high`.
4. Confirm the staging reports contain actual evidence and do not claim unperformed tests.
5. Stage only intended source, migration and documentation files.
6. Re-run status and inspect the staged diff.
7. Commit only after review; do not amend unrelated commits.
8. Push only after staging approval and explicit authorization.

No commit or push was performed for this audit.
