# Domain 4: plus-entitlements (MODIFIED delta)
(Previously: Plus gated AI quota and group creation; auto-import not gated.)
## MODIFIED Requirements
### R4.1 Auto-import is Plus-only
Linking and syncing MUST require is_plus(); AI categorization is a Plus feature. Free users MUST NOT link. Lapsed Plus: scheduled sync MUST pause (connection kept, status plus_lapsed or equivalent), imported movements MUST remain, tokens MAY remain until unlink; unlink stays allowed.
- S: GIVEN free user THEN link refused (plus_required 54000). [pgTAP]
- S: GIVEN Plus expires WHEN cron fires THEN no MP call, movements intact. [Deno/pgTAP]
- S: GIVEN Plus renewed THEN sync resumes without relinking. [Deno]
- S: GIVEN lapsed user WHEN unlinking THEN succeeds. [pgTAP]
