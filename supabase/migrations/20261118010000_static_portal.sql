-- Simple one-paper static portal schema
create table if not exists public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  active boolean not null default true
);

create table if not exists public.profiles (
  firebase_uid text primary key,
  email text not null,
  name text not null,
  roll_no text,
  college_id uuid references public.colleges(id),
  course text,
  semester text,
  phone text,
  role text not null default 'student' check (role in ('student','admin'))
);

create table if not exists public.exam (
  id integer primary key default 1 check (id = 1),
  title text not null,
  description text,
  start_at timestamptz not null,
  duration_minutes integer not null default 30,
  is_published boolean not null default false,
  results_declared boolean not null default false
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id integer not null default 1 references public.exam(id) on delete cascade,
  position integer not null,
  text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A','B','C','D')),
  marks integer not null default 1,
  unique(exam_id, position)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  exam_id integer not null default 1 references public.exam(id),
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','expired')),
  score integer not null default 0,
  unique(firebase_uid, exam_id)
);

create table if not exists public.answers (
  attempt_id uuid references public.attempts(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  selected_option text check (selected_option in ('A','B','C','D')),
  marked_review boolean not null default false,
  primary key (attempt_id, question_id)
);

alter table public.colleges enable row level security;
alter table public.profiles enable row level security;
alter table public.exam enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;

create policy "public read colleges" on public.colleges for select using (true);
create policy "public profiles" on public.profiles for all using (true) with check (true);
create policy "public exam" on public.exam for all using (true) with check (true);
create policy "public questions" on public.questions for all using (true) with check (true);
create policy "public attempts" on public.attempts for all using (true) with check (true);
create policy "public answers" on public.answers for all using (true) with check (true);

insert into public.colleges(name,code) values
 ('Chaudhary Devi Lal University','CDLU'),
 ('Government College for Women, Sirsa','GCW'),
 ('Jan Nayak Ch. Devi Lal Memorial College','JCD'),
 ('Guru Nanak Girls College, Sirsa','GNG'),
 ('Shah Satnam Ji Boys College','SSJB')
ON CONFLICT (code) do nothing;
