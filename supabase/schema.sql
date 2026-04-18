-- Users are handled by Supabase Auth, but we store CR profile info
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  email text not null,
  created_at timestamptz default now()
);

create table courses (
  id uuid default gen_random_uuid() primary key,
  cr_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

create table students (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references courses(id) on delete cascade not null,
  name text not null,
  reg_number text not null,
  created_at timestamptz default now()
);

create table attendance (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references courses(id) on delete cascade not null,
  student_id uuid references students(id) on delete cascade not null,
  date date not null,
  status text check (status in ('present', 'absent')) not null,
  created_at timestamptz default now(),
  unique(course_id, student_id, date)
);

-- Row Level Security
alter table profiles enable row level security;
alter table courses enable row level security;
alter table students enable row level security;
alter table attendance enable row level security;

create policy "CR owns their profile" on profiles for all using (auth.uid() = id);
create policy "CR owns their courses" on courses for all using (auth.uid() = cr_id);
create policy "CR owns their students" on students for all using (
  exists (select 1 from courses where courses.id = students.course_id and courses.cr_id = auth.uid())
);
create policy "CR owns their attendance" on attendance for all using (
  exists (select 1 from courses where courses.id = attendance.course_id and courses.cr_id = auth.uid())
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();