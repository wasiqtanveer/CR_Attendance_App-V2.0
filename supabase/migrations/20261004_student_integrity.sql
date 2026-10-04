-- Apply to existing projects before deploying code that archives students.
-- Resolve duplicate active registration numbers before creating the index.
alter table public.courses add column if not exists risk_threshold integer not null default 75
  check (risk_threshold between 1 and 100);

alter table public.students add column if not exists archived_at timestamptz;

do $$ begin
  if exists (
    select 1 from public.students where archived_at is null
    group by course_id, lower(btrim(reg_number)) having count(*) > 1
  ) then
    raise exception 'Duplicate active registration numbers exist within a course. Resolve them before rerunning this migration.';
  end if;
  if exists (
    select 1 from public.attendance a join public.students s on s.id = a.student_id
    where a.course_id <> s.course_id
  ) then
    raise exception 'Attendance rows reference students from another course. Correct them before rerunning this migration.';
  end if;
end $$;

create unique index if not exists students_course_reg_active_uq
  on public.students (course_id, lower(btrim(reg_number))) where archived_at is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'students_course_id_id_uq') then
    alter table public.students add constraint students_course_id_id_uq unique (course_id, id);
  end if;
end $$;

alter table public.attendance drop constraint if exists attendance_student_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_student_course_fkey') then
    alter table public.attendance add constraint attendance_student_course_fkey
      foreign key (course_id, student_id)
      references public.students(course_id, id) on delete cascade;
  end if;
end $$;
