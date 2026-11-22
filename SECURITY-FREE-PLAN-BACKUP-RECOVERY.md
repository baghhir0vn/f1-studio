# F1 Studio — Free-plan database & Storage backup plan

**Assessed:** 2026-11-21  
**Production Supabase project:** `rfkqxiwbicjsszjbdhzd`  
**Organization:** F1studio — `plan=free`, `tier=tier_free` (verified through connected Supabase management API).  
**Backup evidence status:** **NOT VERIFIED**. No automatic daily database backup entitlement on Free; an independent manual backup may or may not exist, but none was verified.  
**Safety:** This document and metadata checks do NOT create a backup, export customer data, access passwords, or restore production.

## What has actually been checked

1. The Free plan was verified from the production organization's management record.
2. A **READ-ONLY** SQL inventory was run against production: public tables `newsletter_subscribers`, `order_items`, `order_rate_limits`, `orders`, `products`, `profiles`, `reviews`, `site_settings`; all eight had RLS on. The critical functions include `admin_list_orders`, `create_order`, `is_admin`, `subscribe_newsletter`.
3. Storage bucket metadata lists `customer-avatars`, `customer-designs` as private; `product-images`, `site-content` as public. Bucket metadata does NOT demonstrate that a backup of file **bytes** exists.
4. The existing isolated security TEST Supabase project is **not a restored production backup**: it lacks some production table and function structures and contains no corresponding Storage buckets.
5. `tools/restore-structure-audit.sql` reads only metadata. `security-backup-structure-baseline.json` has expected names, and `tools/verify-restore-structure.mjs` rejects a candidate with missing tables, missing critical functions, publicized customer buckets or disabled RLS. A passing comparison **is not enough** to certify data restoration.
6. GitHub Actions `tools/synthetic-db-restore-drill.sh` performs a real `pg_dump` / `pg_restore` rehearsal entirely on fictional PostgreSQL data on a disposable local CI service and checks the restored row/RLS. It does **not** access Supabase or test production backups.

## How the real Free-plan backup must be obtained (requires site owner / trusted operator)

**No credentials should be sent to ChatGPT, pasted into GitHub, or committed.** Choose a trusted computer and encryption/off-site destination first. Disk encryption should be enabled; a Git repository is not an acceptable storage destination for live SQL dumps or personal photos.

1. On a trusted machine, install and verify the **current Supabase CLI and Docker Desktop**. In CLI v3, remote operations must be explicitly targeted using `--remote` (do not accidentally dump a local project). Consult `supabase db dump --help` before proceeding; flags changed in Nov 2026.
2. Open **Supabase Dashboard → Production project → Connect**. The operator obtains a direct or session-pooler connection as recommended by Supabase. Keep credentials out of chat, shell history, CI logs and bug reports. Use a password manager and do not use a role with unnecessary access for ongoing automation.
3. Following the official [Supabase Backup and Restore using CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) guide, create separate **roles**, **schema** and **data** dumps. Do **not** mistake a schema-only dump for a full backup. Include any custom schema, migrations or encrypted database configuration required by your installation. Check the latest v3 CLI semantics rather than relying on obsolete `--db-url`/local defaults.
4. Immediately protect the backups using strong encryption, restrictive file permissions and a separate/off-site destination with retention/versioning. Do not upload plaintext backup files to public or private GitHub repository commits, chat attachments or a publicly accessible URL. Retain at least two independent dated copies; define retention and owner. Protect the encryption key independently from the backup.
5. **Storage needs a separate backup:** export actual object bytes and the path/bucket metadata for `customer-avatars`, `customer-designs`, `product-images`, `site-content` through the approved Supabase Storage API/authorized tooling. Preserve private ACL/ownership relationships. Database dump and Storage table metadata do not recreate photos/design files.
6. Before any live security release, **restore a dated backup into a separately authorized empty project**, not the production project and **not into the current isolated security TEST project**. Disable external side-effect jobs/webhooks/email and protect access to the clone, which may contain real customer data. Beware of plan-dependent clone costs. Never run destructive restore operations on production just to test.
7. Run `tools/restore-structure-audit.sql` against the independent restored database using read-only access. Save only its metadata JSON in a trusted location and compare with:
   `node tools/verify-restore-structure.mjs <candidate-inventory.json>`.
8. In the restored environment, separately verify critical *row completeness* without disclosing personal data, Auth compatibility, the existence/accessibility of object **bytes**, private object ownership, expected indexes, relevant functions, and a legitimate login/checkout smoke test using synthetic accounts. Metadata-only tests and CI's synthetic drill do not supply this proof.
9. Only after successful independent restore and operator review, record backup timestamp, retention window, restore date, and non-sensitive evidence links in `security-production-release-evidence.json`. **Do not change `verified:false` merely because this plan or a GitHub synthetic test passed.**

## Alternative for stronger automatic recovery

Supabase **Pro/Team/Enterprise** include daily database backups. Point-in-time recovery has its own cost/plan considerations. Upgrading may reduce operational effort but **does not replace Storage object backup or a restore rehearsal**. No upgrade, payment or plan change was performed here.

Official documentation:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/changelog/supabase-cli-v3

## Current release verdict

**PRODUCTION SECURITY RELEASE BLOCKED.** The Free-plan organization's independent backup, Storage backup, and end-to-end recovery remain unverified. No production Supabase data, credentials, or production deployment was modified in the preparation of this plan.
