# Parallel Maintenance Mode — M00: baseline & backup safety

**Status:** baseline and repository checks can be completed in CI; **real-device user backup remains an explicit separate action**. No GitHub change can back up a user's Safari/local browser storage.

## 1. Frozen, reproducible baseline (2026-11-22)

- **Baseline commit:** `040adb8629782f0ae4b0fbf37f96c04f86b6103b`
- **Verified deployment:** [GitHub Pages run 45071147096](https://github.com/Stephanielinw/Parallel/actions/runs/45071147096) — build and deployment successful.
- **Recovery branch:** `archive/m00-baseline-20261122` (points to the exact baseline commit). Treat this as a **no-edit snapshot**, not as an active development branch or an immutable signed tag.
- **Maintenance branch/PR:** `maintenance/m00-safety-baseline-20261122`; M00 only introduces documentation and backup regression coverage.
- **Scope:** browser-hosted GitHub Pages edition. The separate Python/SQLite backend has different storage and is not silently considered equivalent.

The baseline is a *known CI-and-deployment-good code snapshot*, not a claim that every feature is bug-free. The commit hash is the ultimate reference even if someone later moves a branch.

## 2. Data that must be preserved

**Authoritative / never auto-delete:** Profiles, character identity and relationship state, original SMS messages, completed and in-progress meeting transcripts, meeting IDs and timestamps, meeting scene/location history, long-term and episodic memories, surveillance history, diaries, presets, user choices, and links between those records.

**Export details as implemented in this baseline:**

- `ParallelOffline.exportData()` exports JSON with `format = parallel-portable-backup` and `schemaVersion = 1`. It excludes API credentials, generated API logs, and gallery-image bytes.
- `ParallelOffline.exportDataWithPhotos()` includes the gallery-image bytes as `chatPhotoFiles` (where available). The UI labels this **导出完整存档 JSON**.
- `ParallelOffline.importDataWithPhotos()` imports a backup and **replaces the current local save**. It does not merge with the current save. A confirmation dialog exists, but a user must still protect the old save separately.
- Current import limits: **20 MiB** for text/metadata JSON and **100 MiB** for complete backups including photos (as enforced by code). A backup exceeding these limits is **not guaranteed restorable by this implementation**; do not delete the source save even if an export succeeds.
- The browser main save is `localStorage['parallel-portable-v2']` (losslessly compressed by current builds). API logs and gallery photo bytes are kept separately; `localStorage` is **not** the phone's full disk capacity.

**Privacy:** A backup contains personal conversations and potentially image data. Keep copies in a private user-controlled location. Never commit a backup, any API key, or character chat transcripts to this public source repository. Even though API keys are stripped, **the backup itself is not encrypted**.

## 3. Actual iPhone backup — required before storage migration or destructive changes

1. Open the **existing** Parallel app on the phone, select **终端 → 存档备份**, and tap **导出完整存档 JSON** (not the text-only option if gallery photos matter).
2. In Files, confirm that the downloaded `Parallel_Backup_YYYY-MM-DD.json` exists and is nonempty. Keep the original untouched; copy it to a second **private** location you control (e.g. a separate device or a protected personal drive).
3. Record only non-sensitive checks: file size, export date, and that the expected Profile/character records appear in the running app. Do not share the full backup in a GitHub issue or public chat.
4. Do **not** tap **恢复存档** in the live phone session merely to test it. That path overwrites current data. If a restore test is needed, use a **separate isolated browser profile/device**, not the live origin; verify message count, meetings, memories, diary, and photos there.
5. Keep the two copies until M03–M04 migrations finish and independent restore verification succeeds. Never clear Safari website data, uninstall the PWA, or delete the active save as a troubleshooting step.

**Required status marker before M03/M04:** `real-device-backup-verified = YES` only after the user confirms the export file exists and was safely copied. Current repo work alone leaves it **NO / pending user**.

## 4. Version rollback vs. data rollback

**Code rollback (non-destructive):** Create a *new* branch from `040adb8629782f0ae4b0fbf37f96c04f86b6103b`, or use a normal PR reverting later changes; run the full CI suite, deploy via `main`, and verify Pages. Do not force-push `main`. Re-check current HEAD/PR state to avoid reverting other people's changes by accident.

**Data rollback (destructive unless isolated):** Use the user's local JSON export only after preserving the current local data and verifying compatibility with the target code. **Never** assume rolling back GitHub code also rolls back Safari storage. A stale code version may not understand a newer save format; recovery must be tested separately before use.

**Stop-and-revert criteria:** failed backup import, changed message/meeting counts, corrupted text (including Unicode), missing image references, loss of character/Profile isolation, irreversible schema changes, or any previously-working user journey regressing. Do not merge a storage migration until rollback conditions are documented and tested.

## 5. M00 test and release contract

- `node tests/m00-backup-contract.test.cjs` is a **no-network** synthetic fixture test. It checks JSON round-trip for messages, meeting entries, references, memories, surveillance and diary; sanitization of API credentials; invalid backup rejection; and blocked-storage rollback.
- Existing `tests/chat-photos.test.cjs` exercises image backup/import through a mocked IndexedDB.
- Existing `tests/browser-storage-quota-rescue.test.cjs` checks compressed legacy save recovery, read-only access, Unicode preservation and quota failures.
- CI must pass **before** merging documentation or test changes. Passing mocked tests is not a substitute for a real-device backup, real Safari test, or an end-to-end production guarantee.
- Subsequent M01–M09 work must use its own branch/PR, reuse the same protected baseline commit for comparison, and make behavioral compatibility explicit.

## 6. M00 acceptance checklist

- [x] Identify exact deployed commit and successful Pages workflow.
- [x] Create named code snapshot branch without changing the baseline.
- [x] Document backup scope, limitations, failure modes and safe rollback.
- [ ] Add and pass synthetic backup round-trip CI tests. *(Checked automatically in M00 PR.)*
- [ ] User exports the actual iPhone complete backup and keeps a second private copy. *(Cannot be completed from GitHub.)*

**No production data was read, exported, modified or migrated during M00.**
