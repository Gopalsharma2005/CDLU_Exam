-- Run this in Supabase Dashboard > SQL Editor
create table if not exists colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  firebase_uid text primary key,
  email text unique not null,
  name text not null,
  roll_no text unique,
  college_id uuid references colleges(id),
  course text,
  semester text,
  phone text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  college_id uuid references colleges(id),
  course text,
  semester text,
  start_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  status text not null default 'draft' check (status in ('draft','published','closed','results_declared')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A','B','C','D')),
  marks numeric not null default 1,
  position integer not null default 0
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id),
  firebase_uid text not null,
  started_at timestamptz,
  submitted_at timestamptz,
  server_locked_at timestamptz,
  score numeric,
  status text not null default 'not_started' check (status in ('not_started','in_progress','submitted','expired')),
  unique(exam_id, firebase_uid)
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  selected_option text check (selected_option in ('A','B','C','D')),
  updated_at timestamptz not null default now(),
  unique(attempt_id, question_id)
);

alter table colleges enable row level security;
alter table profiles enable row level security;
alter table exams enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;
alter table answers enable row level security;

insert into colleges (name, code) values
  ('Chaudhary Devi Lal University', 'CDLU'),
  ('Government College, Sirsa', 'GCS'),
  ('Ch. Mani Ram Jhorar Government Post Graduate College, Mandi Dabwali', 'CMRJ'),
  ('Shah Satnam Ji Girls College, Sirsa', 'SSJGC')
ON CONFLICT (code) do nothing;

create or replace view exam_question_counts as
select e.id as exam_id, count(q.id)::int as question_count
from exams e left join questions q on q.exam_id=e.id
group by e.id;

-- Private tables are accessed only through trusted server/Edge Functions.
-- These broad policy defaults deny direct browser access through Supabase anon/auth keys.
create policy "deny college access" on colleges for all using (false) with check (false);
create policy "deny profile access" on profiles for all using (false) with check (false);
create policy "deny exam access" on exams for all using (false) with check (false);
create policy "deny question access" on questions for all using (false) with check (false);
create policy "deny attempt access" on attempts for all using (false) with check (false);
create policy "deny answer access" on answers for all using (false) with check (false);

create or replace function submit_attempt(p_attempt_id uuid, p_firebase_uid text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt attempts%rowtype;
  v_exam exams%rowtype;
  v_score numeric := 0;
  v_deadline timestamptz;
begin
  select * into v_attempt from attempts where id=p_attempt_id for update;
  if not found then raise exception 'Attempt not found'; end;
  if v_attempt.firebase_uid <> p_firebase_uid then raise exception 'Not your attempt'; end;
  if v_attempt.status='submitted' then return coalesce(v_attempt.score,0); end;

  select * into v_exam from exams where id=v_attempt.exam_id;
  v_deadline := v_attempt.started_at + make_interval(mins=>v_exam.duration_minutes);
  if now() >= v_deadline and v_attempt.status='in_progress' then
    update attempts set status='expired', server_locked_at=now() where id=p_attempt_id;
    raise exception 'Exam time expired';
  end;
  select coalesce(sum(q.marks),0) into v_score
  from answers a
  join questions q on q.id=a.question_id
  where a.attempt_id=p_attempt_id and a.selected_option=q.correct_option;

  update attempts
  set status='submitted', submitted_at=now(), server_locked_at=now(), score=v_score
  where id=p_attempt_id;
  return v_score;
end;
$$;

revoke all on function submit_attempt(uuid,text) from anon, authenticated;

create index if not exists idx_attempts_exam_uid on attempts(exam_id, firebase_uid);
create index if not exists idx_answers_attempt on answers(attempt_id);
create index if not exists idx_questions_exam_position on questions(exam_id, position);
create index if not exists idx_exams_status_start on exams(status, start_at);

create or replace function start_attempt(p_exam_id uuid, p_firebase_uid text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt attempts%rowtype;
  v_exam exams%rowtype;
begin
  select * into v_exam from exams where id=p_exam_id for update;
  if not found then raise exception 'Exam not found'; end;
  if v_exam.status <> 'published' then raise exception 'Exam is not available'; end;
  if now() < v_exam.start_at then raise exception 'Exam has not started'; end;

  select * into v_attempt from attempts where exam_id=p_exam_id and firebase_uid=p_firebase_uid for update;
  if found then
    if v_attempt.status='submitted' or v_attempt.status='expired' then
      raise exception 'Attempt already locked';
    end;
    if v_attempt.started_at is not null then
      if now() >= v_attempt.started_at + make_interval(mins=>v_exam.duration_minutes) then
        update attempts set status='expired', server_locked_at=now() where id=v_attempt.id;
        raise exception 'Exam time expired';
      end;
      return v_attempt.id;
    end;
  else
    insert into attempts(exam_id, firebase_uid) values(p_exam_id,p_firebase_uid)
    returning * into v_attempt;
  end;

  update attempts set started_at=now(), status='in_progress' where id=v_attempt.id;
  return v_attempt.id;
end;
$$;

create or replace function save_answer(p_attempt_id uuid, p_firebase_uid text, p_question_id uuid, p_option text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt attempts%rowtype;
  v_exam exams%rowtype;
begin
  select * into v_attempt from attempts where id=p_attempt_id for update;
  if not found or v_attempt.firebase_uid<>p_firebase_uid then raise exception 'Attempt not found'; end;
  if v_attempt.status='submitted' or v_attempt.status='expired' then raise exception 'Attempt is locked'; end;
  select * into v_exam from exams where id=v_attempt.exam_id;
  if v_attempt.started_at is null or now() >= v_attempt.started_at + make_interval(mins=>v_exam.duration_minutes) then
    update attempts set status='expired', server_locked_at=now() where id=p_attempt_id;
    raise exception 'Exam time expired';
  end;
  if p_option is not null and p_option not in ('A','B','C','D') then raise exception 'Invalid option'; end;

  insert into answers(attempt_id,question_id,selected_option,updated_at)
  values(p_attempt_id,p_question_id,p_option,now())
  on conflict(attempt_id,question_id) do update set selected_option=excluded.selected_option,updated_at=now();
end;
$$;

revoke all on function start_attempt(uuid,text) from anon, authenticated;
revoke all on function save_answer(uuid,text,uuid,text) from anon, authenticated;
