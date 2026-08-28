alter table public.ai_generation_runs
  add column if not exists status_updated_at timestamptz;

update public.ai_generation_runs
set status_updated_at = coalesce(status_updated_at, created_at)
where status_updated_at is null;

update public.ai_generation_runs
set
  status = 'failed',
  error_message = coalesce(error_message, 'The image generation worker exceeded its startup or execution deadline.'),
  status_updated_at = timezone('utc', now())
where status in ('pending', 'running')
  and status_updated_at < timezone('utc', now()) - interval '20 minutes';

alter table public.ai_generation_runs
  alter column status_updated_at set default timezone('utc', now()),
  alter column status_updated_at set not null;
