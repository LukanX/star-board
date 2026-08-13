-- Star Board AI audit retention
-- Default policy: retain generation metadata for 90 days.
-- Run this as a database owner/service role or from a trusted scheduler.
-- Do not expose this statement through the browser or an authenticated API route.

begin;

delete from public.ai_generation_runs
where created_at < timezone('utc', now()) - interval '90 days';

commit;