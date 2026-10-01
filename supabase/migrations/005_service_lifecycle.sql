-- 005_service_lifecycle.sql — carry-over from Brick 1/2: mark unconfirmed services draft
update services set status = 'draft' where code in ('billing_rcm','scheduling','marketing');