# Parallel · Meeting structured scene locations & location-change summaries

> Extends the deployed M10-A baseline (46dd2f8). This is a focused behavioral change to meeting turns only, NOT a storage migration. It does not modify existing user chats, erase historical checkpoints, change Profile × character identity isolation, or turn speculative surveillance into facts.

## New meeting response contract

Each successful meeting model reply includes **two distinct pieces of information**: full third-person scene prose (`text`) and a separate, mandatory **actual physical location at the end of that reply** (`location`). On true spatial transitions it also provides a short literal `location_evidence` copied from the original model narrative or actual latest user action. Example JSON:

```json
{"text":"他推开门，已经走进屋内，在床沿坐下。","location":"宿舍卧室","location_evidence":"走进屋内，在床沿坐下"}
```

Only `text` is displayed as the AI's meeting scene. Location/evidence metadata is not included inside the story bubble. A location must be saved **on every reply**, including stationary ones. The prior scene's verified location, user/AI original actions, explicit manual correction and archived meeting history determine the current location; a monitor or future itinerary cannot override it. The model's claim is not proof of movement on its own: a planned future trip, quoted suggestion or imaginary scene must not teleport the characters. Older plain-text responses remain readable; compatible engines still allow a conservative original-evidence classifier when a model ignores the new output format.

## Stage summaries are tied to actual transitions

- No new **fixed 50-complete-exchange** automatic stage summaries. Existing 50-group checkpoint records and memory references are retained, source-checked and readable for historical compatibility.
- A new source-bound scene checkpoint is created **when a verified movement changes physical location**. Its `from_location` is the stage just finished, `to_location` the confirmed new place, and its `message_ids` are the original messages from that stage, not guessed monitoring evidence.
- AI factual digest comes **from original scene messages only**, with chronological chunking for longer sections and modest JSON response budgets. If the model fails, an explicitly unverified fallback refers users to the raw transcript instead of inventing a false shared memory. The boundary is deduplicated by original transition message ID and source signature.
- The monitor gets the actual movement immediately. When the stage summary arrives, it is shown on the **just-finished location segment**, not spread across the whole day or turned into a fictional schedule. The next scene picks up from the actual last known location.
- When an original message is edited, rerolled, recalled or removed, its source signature is invalidated. Stale derived recaps cannot be used as trusted narrative facts or override raw turns. Existing manual final meeting recap and the full unabridged meeting transcript remain protected.
- The Python SQLite variant uses its own **additive** `meeting_scene_summaries` table alongside the existing `meeting_checkpoints`; browser `db.meetingCheckpoints` stores new scene records with `kind:'scene_transition'`. No cross-origin data migration and no automatic cleanup of older data.

## Verification and limits

- Automated synthetic tests: stationary repeated locations, confirmed physical movement, unfulfilled location suggestions, stage recap source IDs, monitoring follows scenes rather than old schedules, 50-group generation retired, existing old checkpoints remain readable, source mutation invalidation and both browser / Python versions.
- All prior M00–M10 checks, M06 two-runtime mirror check, M08 static frontend/route parity, M09 asset integrity and mobile-size actual WebKit regression remain release gates.
- **Real device** Safari/iPhone PWA testing and private user backups still require explicit user-side verification. CI has no access to personal conversations or provider accounts. No paid LLM calls occur in tests; only production's explicitly configured provider is used for real new scene digests.
- The model's `location_evidence` is a narrow, checkable string. No text-only verifier can guarantee perfect physical continuity; user/manual corrections and original turn history still win over a hallucinated field.

## Rollback

Revert this PR via a normal PR and preserve all browser storage and SQLite data. Do not erase `meeting_scene_summaries` or rebuild the user's SQLite file: older code can ignore the additive table. Old 50-block archive material remains; newer location metadata on meeting AI messages does not alter their visible prose. For any recovery, first export the original complete backup to a private place and independently verify it.
