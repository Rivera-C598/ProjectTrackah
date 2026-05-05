create extension if not exists pgcrypto;

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null,
  max_groups int not null default 8 check (max_groups between 1 and 40),
  max_members int not null default 6 check (max_members between 1 and 12),
  created_by uuid references public.teacher_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.section_teachers (
  section_id uuid not null references public.sections(id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  role text not null default 'teacher' check (role in ('owner', 'teacher')),
  created_at timestamptz not null default now(),
  primary key (section_id, teacher_id)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  full_name text not null,
  student_id_num text,
  created_at timestamptz not null default now(),
  unique (section_id, full_name)
);
alter table public.students add column if not exists student_id_num text;

create table if not exists public.project_titles (
  id int primary key,
  name text not null,
  description text not null,
  recommended boolean not null default false,
  fields text[] not null default '{}'
);

create table if not exists public.claim_codes (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  code text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (section_id, code)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  code_id uuid not null unique references public.claim_codes(id),
  name text not null,
  password_hash text not null,
  project_title_id int not null references public.project_titles(id),
  max_members int check (max_members between 1 and 12),
  created_at timestamptz not null default now(),
  unique (section_id, name),
  unique (section_id, project_title_id)
);
alter table public.groups add column if not exists max_members int check (max_members between 1 and 12);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id),
  unique (student_id)
);

create table if not exists public.group_checklist (
  group_id uuid not null references public.groups(id) on delete cascade,
  item_key text not null,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (group_id, item_key)
);

alter table public.teacher_profiles enable row level security;
alter table public.sections enable row level security;
alter table public.section_teachers enable row level security;
alter table public.students enable row level security;
alter table public.project_titles enable row level security;
alter table public.claim_codes enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_checklist enable row level security;

drop policy if exists "teachers read own profile" on public.teacher_profiles;
create policy "teachers read own profile" on public.teacher_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "project titles public read" on public.project_titles;
create policy "project titles public read" on public.project_titles
  for select to anon, authenticated using (true);

drop policy if exists "teachers read their sections" on public.sections;
create policy "teachers read their sections" on public.sections
  for select to authenticated using (
    exists (
      select 1 from public.section_teachers st
      where st.section_id = sections.id and st.teacher_id = auth.uid()
    )
  );

drop policy if exists "teachers read section links" on public.section_teachers;
create policy "teachers read section links" on public.section_teachers
  for select to authenticated using (teacher_id = auth.uid());

drop function if exists public.is_section_teacher(uuid);
create function public.is_section_teacher(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.section_teachers
    where section_id = p_section_id and teacher_id = auth.uid()
  );
$$;

drop function if exists public.bootstrap_section(text);
create function public.bootstrap_section(p_section_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section public.sections%rowtype;
begin
  select * into v_section from public.sections where slug = p_section_slug;
  if not found then
    raise exception 'Section not found';
  end if;

  return jsonb_build_object(
    'section', jsonb_build_object(
      'id', v_section.id,
      'slug', v_section.slug,
      'name', v_section.name,
      'maxGroups', v_section.max_groups,
      'maxMembers', v_section.max_members
    ),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id,
        'name', pt.name,
        'description', pt.description,
        'recommended', pt.recommended,
        'fields', pt.fields,
        'claimedBy', g.name
      ) order by pt.id)
      from public.project_titles pt
      left join public.groups g on g.section_id = v_section.id and g.project_title_id = pt.id
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.claim_project_title(text, text, int, text);
create function public.claim_project_title(
  p_section_slug text,
  p_code text,
  p_project_title_id int,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section public.sections%rowtype;
  v_code public.claim_codes%rowtype;
  v_group public.groups%rowtype;
  v_group_count int;
  v_group_name text;
begin
  if length(coalesce(p_password, '')) < 4 then
    raise exception 'Password must be at least 4 characters';
  end if;

  select * into v_section from public.sections where slug = p_section_slug;
  if not found then raise exception 'Section not found'; end if;

  select * into v_code
  from public.claim_codes
  where section_id = v_section.id and upper(code) = upper(trim(p_code))
  for update;
  if not found then raise exception 'Claim code not found'; end if;
  if v_code.used_at is not null then raise exception 'Claim code already used'; end if;

  if exists (
    select 1 from public.groups
    where section_id = v_section.id and project_title_id = p_project_title_id
  ) then
    raise exception 'Project title already claimed';
  end if;

  select count(*) into v_group_count from public.groups where section_id = v_section.id;
  if v_group_count >= v_section.max_groups then
    raise exception 'Maximum groups reached for this section';
  end if;

  v_group_name := 'Group ' || chr(65 + v_group_count);

  insert into public.groups (section_id, code_id, name, password_hash, project_title_id)
  values (
    v_section.id,
    v_code.id,
    v_group_name,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_project_title_id
  )
  returning * into v_group;

  update public.claim_codes set used_at = now() where id = v_code.id;

  return jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'projectTitleId', v_group.project_title_id
  );
end;
$$;

drop function if exists public.login_group(text, text, text);
create function public.login_group(p_section_slug text, p_code text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
  v_section public.sections%rowtype;
begin
  select * into v_section from public.sections where slug = p_section_slug;
  if not found then raise exception 'Section not found'; end if;

  select g.* into v_group
  from public.groups g
  join public.claim_codes cc on cc.id = g.code_id
  where g.section_id = v_section.id and upper(cc.code) = upper(trim(p_code));
  if not found or v_group.password_hash <> extensions.crypt(p_password, v_group.password_hash) then
    raise exception 'Invalid group code or password';
  end if;

  return public.group_dashboard(v_group.id);
end;
$$;

drop function if exists public.group_dashboard(uuid);
create function public.group_dashboard(p_group_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'group', jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'projectTitleId', g.project_title_id,
      'projectTitle', pt.name,
      'projectDescription', pt.description,
      'projectFields', pt.fields,
      'maxMembers', coalesce(g.max_members, sec.max_members)
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'fullName', s.full_name) order by s.full_name)
      from public.group_members gm
      join public.students s on s.id = gm.student_id
      where gm.group_id = g.id
    ), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_object_agg(item_key, done)
      from public.group_checklist
      where group_id = g.id
    ), '{}'::jsonb)
  )
  from public.groups g
  join public.project_titles pt on pt.id = g.project_title_id
  join public.sections sec on sec.id = g.section_id
  where g.id = p_group_id;
$$;

drop function if exists public.search_section_students(uuid, text);
drop function if exists public.search_section_students(uuid, text, text);
create function public.search_section_students(p_group_id uuid, p_password text, p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found or v_group.password_hash <> extensions.crypt(p_password, v_group.password_hash) then
    raise exception 'Invalid dashboard session';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ranked.id,
      'fullName', ranked.full_name,
      'assignedGroup', ranked.assigned_group
    ) order by ranked.full_name), '[]'::jsonb)
    from (
      select s.id, s.full_name, ag.name as assigned_group
      from public.students s
      left join public.group_members gm on gm.student_id = s.id
      left join public.groups ag on ag.id = gm.group_id
      where s.section_id = v_group.section_id
        and (coalesce(p_query, '') = '' or s.full_name ilike '%' || p_query || '%')
      order by s.full_name
      limit 12
    ) ranked
  );
end;
$$;

drop function if exists public.add_group_member(uuid, uuid);
drop function if exists public.add_group_member(uuid, uuid, text);
create function public.add_group_member(p_group_id uuid, p_student_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
  v_student public.students%rowtype;
  v_count int;
  v_max int;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if v_group.password_hash <> extensions.crypt(p_password, v_group.password_hash) then
    raise exception 'Invalid dashboard session';
  end if;
  select * into v_student from public.students where id = p_student_id;
  if not found or v_student.section_id <> v_group.section_id then
    raise exception 'Student is not in this section';
  end if;
  if exists (select 1 from public.group_members where student_id = p_student_id) then
    raise exception 'Student already has a group';
  end if;
  select coalesce(v_group.max_members, s.max_members) into v_max
  from public.sections s where s.id = v_group.section_id;
  select count(*) into v_count from public.group_members where group_id = p_group_id;
  if v_count >= v_max then raise exception 'Group is already full'; end if;

  insert into public.group_members (group_id, student_id) values (p_group_id, p_student_id);
  return public.group_dashboard(p_group_id);
end;
$$;

drop function if exists public.remove_group_member(uuid, uuid);
drop function if exists public.remove_group_member(uuid, uuid, text);
create function public.remove_group_member(p_group_id uuid, p_student_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found or v_group.password_hash <> extensions.crypt(p_password, v_group.password_hash) then
    raise exception 'Invalid dashboard session';
  end if;
  delete from public.group_members where group_id = p_group_id and student_id = p_student_id;
  return public.group_dashboard(p_group_id);
end;
$$;

drop function if exists public.set_group_checklist(uuid, text, boolean);
drop function if exists public.set_group_checklist(uuid, text, boolean, text);
create function public.set_group_checklist(p_group_id uuid, p_item_key text, p_done boolean, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found or v_group.password_hash <> extensions.crypt(p_password, v_group.password_hash) then
    raise exception 'Invalid dashboard session';
  end if;
  insert into public.group_checklist (group_id, item_key, done, updated_at)
  values (p_group_id, p_item_key, p_done, now())
  on conflict (group_id, item_key)
  do update set done = excluded.done, updated_at = now();
  return public.group_dashboard(p_group_id);
end;
$$;

drop function if exists public.teacher_bootstrap();
create function public.teacher_bootstrap()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'name', s.name,
    'maxGroups', s.max_groups,
    'maxMembers', s.max_members
  ) order by s.name), '[]'::jsonb)
  from public.sections s
  join public.section_teachers st on st.section_id = s.id
  where st.teacher_id = auth.uid();
$$;

drop function if exists public.teacher_section_detail(uuid);
create function public.teacher_section_detail(p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_section_teacher(p_section_id) then
    raise exception 'Not allowed';
  end if;

  return jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'fullName', s.full_name,
        'groupName', g.name
      ) order by s.full_name)
      from public.students s
      left join public.group_members gm on gm.student_id = s.id
      left join public.groups g on g.id = gm.group_id
      where s.section_id = p_section_id
    ), '[]'::jsonb),
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cc.id,
        'code', cc.code,
        'used', cc.used_at is not null,
        'groupName', g.name
      ) order by cc.code)
      from public.claim_codes cc
      left join public.groups g on g.code_id = cc.id
      where cc.section_id = p_section_id
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'code', cc.code,
        'projectTitle', pt.name,
        'maxMembers', coalesce(g.max_members, sec.max_members),
        'members', coalesce((
          select jsonb_agg(s.full_name order by s.full_name)
          from public.group_members gm
          join public.students s on s.id = gm.student_id
          where gm.group_id = g.id
        ), '[]'::jsonb)
      ) order by g.name)
      from public.groups g
      join public.project_titles pt on pt.id = g.project_title_id
      join public.claim_codes cc on cc.id = g.code_id
      join public.sections sec on sec.id = g.section_id
      where g.section_id = p_section_id
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.teacher_create_section(text, text, int, int);
create function public.teacher_create_section(p_name text, p_slug text, p_max_groups int default 8, p_max_members int default 6)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher public.teacher_profiles%rowtype;
  v_section public.sections%rowtype;
begin
  select * into v_teacher from public.teacher_profiles where id = auth.uid();
  if not found then raise exception 'Teacher profile not allowed'; end if;

  insert into public.sections (name, slug, max_groups, max_members, created_by)
  values (p_name, p_slug, p_max_groups, p_max_members, auth.uid())
  returning * into v_section;

  insert into public.section_teachers (section_id, teacher_id, role)
  values (v_section.id, auth.uid(), 'owner');

  return jsonb_build_object('id', v_section.id, 'name', v_section.name, 'slug', v_section.slug);
end;
$$;

drop function if exists public.teacher_replace_roster(uuid, text[]);
create function public.teacher_replace_roster(p_section_id uuid, p_names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_section_teacher(p_section_id) then raise exception 'Not allowed'; end if;

  delete from public.students
  where section_id = p_section_id
    and id not in (
      select student_id from public.group_members
      union
      select student_id from public.iot_group_members
    );

  insert into public.students (section_id, full_name, student_id_num)
  select
    p_section_id,
    case
      when trim(entry) ~ '^[0-9]{6,8}\s+'
      then trim(regexp_replace(trim(entry), '^[0-9]{6,8}\s+', ''))
      else trim(entry)
    end,
    case
      when trim(entry) ~ '^[0-9]{6,8}\s+'
      then (regexp_match(trim(entry), '^([0-9]{6,8})'))[1]
      else null
    end
  from unnest(p_names) as entry
  where trim(entry) <> ''
  on conflict (section_id, full_name) do update set
    student_id_num = excluded.student_id_num;
end;
$$;

drop function if exists public.teacher_generate_codes(uuid, int);
create function public.teacher_generate_codes(p_section_id uuid, p_count int default 12)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  v_code text;
  v_existing int;
  v_to_generate int;
begin
  if not public.is_section_teacher(p_section_id) then raise exception 'Not allowed'; end if;
  select count(*) into v_existing from public.claim_codes where section_id = p_section_id;
  v_to_generate := least(p_count, p_count - v_existing);
  if v_to_generate <= 0 then return; end if;
  for i in 1..v_to_generate loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    insert into public.claim_codes (section_id, code)
    values (p_section_id, v_code)
    on conflict do nothing;
  end loop;
end;
$$;

drop function if exists public.teacher_delete_code(uuid, uuid);
create function public.teacher_delete_code(p_section_id uuid, p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_section_teacher(p_section_id) then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.claim_codes where id = p_code_id and used_at is not null) then
    raise exception 'Code is already in use by a group';
  end if;
  delete from public.claim_codes where id = p_code_id and section_id = p_section_id and used_at is null;
end;
$$;

drop function if exists public.teacher_delete_unused_codes(uuid);
create function public.teacher_delete_unused_codes(p_section_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_section_teacher(p_section_id) then raise exception 'Not allowed'; end if;
  delete from public.claim_codes where section_id = p_section_id and used_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists public.teacher_remove_group(uuid);
create function public.teacher_remove_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if not public.is_section_teacher(v_group.section_id) then raise exception 'Not allowed'; end if;
  delete from public.groups where id = p_group_id;
  update public.claim_codes set used_at = null where id = v_group.code_id;
end;
$$;

drop function if exists public.teacher_reset_claims(uuid);
create function public.teacher_reset_claims(p_section_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_section_teacher(p_section_id) then raise exception 'Not allowed'; end if;
  delete from public.groups where section_id = p_section_id;
  update public.claim_codes set used_at = null where section_id = p_section_id;
end;
$$;

drop function if exists public.teacher_set_group_max_members(uuid, int);
create function public.teacher_set_group_max_members(p_group_id uuid, p_max_members int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
begin
  select section_id into v_section_id from public.groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if not public.is_section_teacher(v_section_id) then raise exception 'Not allowed'; end if;
  update public.groups set max_members = p_max_members where id = p_group_id;
end;
$$;

drop function if exists public.teacher_move_member(uuid, uuid);
create function public.teacher_move_member(p_student_id uuid, p_target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section uuid;
  v_target public.groups%rowtype;
  v_count int;
  v_max int;
begin
  select section_id into v_section from public.students where id = p_student_id;
  select * into v_target from public.groups where id = p_target_group_id;
  if v_section is null or not found or v_target.section_id <> v_section then
    raise exception 'Invalid move';
  end if;
  if not public.is_section_teacher(v_section) then raise exception 'Not allowed'; end if;
  select max_members into v_max from public.sections where id = v_section;
  select count(*) into v_count from public.group_members where group_id = p_target_group_id;
  if v_count >= v_max then raise exception 'Target group is full'; end if;
  delete from public.group_members where student_id = p_student_id;
  insert into public.group_members (group_id, student_id) values (p_target_group_id, p_student_id);
end;
$$;

insert into public.project_titles (id, recommended, name, description, fields) values
  (1, true, 'Student Record Management System', 'A system for managing student information including personal details, enrollment status, and academic records.', array['StudentId','FirstName','LastName','Course','Year','Status']),
  (2, true, 'Product Inventory Management System', 'An admin panel for tracking product stock, pricing, and category information.', array['ProductId','ProductName','Category','Quantity','Price','Status']),
  (3, true, 'Employee Record Management System', 'A system for managing employee profiles, departments, and employment status.', array['EmployeeId','FullName','Department','Position','DateHired','Status']),
  (4, true, 'Appointment Record Management System', 'A booking and scheduling system for managing appointments with clients or patients.', array['AppointmentId','ClientName','Service','Date','Time','Status']),
  (5, false, 'Customer Information Management System', 'A CRM-lite system for tracking customer details and contact information.', array['CustomerId','Name','Email','Phone','Address','DateAdded']),
  (6, false, 'Book Inventory Management System', 'A library or bookstore tool for managing book titles, authors, stock, and categories.', array['BookId','Title','Author','Genre','Quantity','Price']),
  (7, false, 'Clinic Patient Record System', 'A patient records system for a small clinic tracking consultations and diagnoses.', array['PatientId','Name','Age','Gender','Diagnosis','VisitDate']),
  (8, false, 'Supplier Management System', 'Track supplier details, product categories they supply, and contact information.', array['SupplierId','SupplierName','ContactPerson','Email','Phone','Category']),
  (9, false, 'Sales Item Record System', 'A simple sales tracking tool for logging items sold, quantities, and totals.', array['SaleId','ItemName','Category','Quantity','UnitPrice','SaleDate']),
  (10, false, 'Simple Ordering Record System', 'Track customer orders, ordered items, and order status for a small business.', array['OrderId','CustomerName','Item','Quantity','TotalAmount','Status']),
  (11, false, 'Library Borrower Record System', 'Manage book borrow and return transactions for a school or community library.', array['BorrowId','BorrowerName','BookTitle','BorrowDate','ReturnDate','Status']),
  (12, false, 'Equipment Borrowing System', 'Track borrowed equipment, borrower details, and return schedules.', array['BorrowId','EquipmentName','BorrowerName','BorrowDate','DueDate','Status']),
  (13, false, 'Room Reservation Record System', 'A booking system for managing room reservations and availability.', array['ReservationId','RoomName','GuestName','CheckIn','CheckOut','Status']),
  (14, false, 'Service Request Management System', 'Track internal or external service requests, assignees, and resolution status.', array['RequestId','RequestTitle','RequestedBy','AssignedTo','DateFiled','Status']),
  (15, false, 'Vehicle Maintenance Record System', 'Log vehicle maintenance history, services done, and scheduled next service.', array['RecordId','VehicleName','PlateNumber','ServiceType','ServiceDate','NextSchedule'])
on conflict (id) do update set
  recommended = excluded.recommended,
  name = excluded.name,
  description = excluded.description,
  fields = excluded.fields;

-- First teacher setup after signing up:
-- insert into public.teacher_profiles (id, email, display_name)
-- select id, email, raw_user_meta_data->>'full_name'
-- from auth.users
-- where email = 'your-email@example.com'
-- on conflict (id) do nothing;

-- ============================================================
-- IoT / Arduino Final Project Tables
-- ============================================================

create table if not exists public.iot_groups (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  name text not null,
  project_title text not null default '',
  owner_student_id uuid references public.students(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (section_id, name)
);
alter table public.iot_groups add column if not exists owner_student_id uuid references public.students(id) on delete set null;

create table if not exists public.iot_group_members (
  group_id uuid not null references public.iot_groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id),
  unique (student_id)
);
alter table public.iot_group_members add column if not exists created_at timestamptz not null default now();

alter table public.iot_groups enable row level security;
alter table public.iot_group_members enable row level security;

-- ============================================================
-- IoT RPCs
-- ============================================================

drop function if exists public.iot_verify_student_id(uuid, text);
create function public.iot_verify_student_id(p_student_id uuid, p_student_id_num text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students
    where id = p_student_id
      and student_id_num is not null
      and student_id_num = trim(p_student_id_num)
  );
$$;

-- Helper: build groups array for a section
create or replace function public._iot_groups_for_section(p_section_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ig.id,
      'name', ig.name,
      'projectTitle', ig.project_title,
      'ownerStudentId', ig.owner_student_id,
      'memberCount', coalesce(mc.cnt, 0),
      'members', coalesce(ml.members, '[]'::jsonb)
    ) order by ig.created_at
  ), '[]'::jsonb)
  from public.iot_groups ig
  left join (
    select group_id, count(*) as cnt from public.iot_group_members group by group_id
  ) mc on mc.group_id = ig.id
  left join (
    select igm.group_id,
      jsonb_agg(jsonb_build_object('id', s.id, 'fullName', s.full_name) order by s.full_name) as members
    from public.iot_group_members igm
    join public.students s on s.id = igm.student_id
    group by igm.group_id
  ) ml on ml.group_id = ig.id
  where ig.section_id = p_section_id;
$$;

-- iot_bootstrap: anon-accessible section + groups
drop function if exists public.iot_bootstrap(text);
create function public.iot_bootstrap(p_section_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section public.sections%rowtype;
begin
  select * into v_section from public.sections where slug = p_section_slug;
  if not found then
    raise exception 'Section not found';
  end if;

  return jsonb_build_object(
    'section', jsonb_build_object(
      'id', v_section.id,
      'slug', v_section.slug,
      'name', v_section.name,
      'maxMembers', 5
    ),
    'groups', public._iot_groups_for_section(v_section.id)
  );
end;
$$;

-- iot_search_students: anon-accessible roster search
drop function if exists public.iot_search_students(uuid, text);
create function public.iot_search_students(p_section_id uuid, p_query text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'fullName', s.full_name,
      'assignedGroup', ag.name
    ) order by s.full_name
  ), '[]'::jsonb)
  from (
    select s.id, s.full_name
    from public.students s
    where s.section_id = p_section_id
      and (coalesce(p_query, '') = '' or s.full_name ilike '%' || p_query || '%')
    order by s.full_name
    limit 10
  ) s
  left join public.iot_group_members igm on igm.student_id = s.id
  left join public.iot_groups ag on ag.id = igm.group_id;
$$;

-- iot_create_group: anon, verify student in section and not in group
drop function if exists public.iot_create_group(uuid, uuid, text, text);
drop function if exists public.iot_create_group(uuid, uuid, text, text, text);
create function public.iot_create_group(
  p_section_id uuid,
  p_student_id uuid,
  p_group_name text,
  p_project_title text default '',
  p_student_id_num text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  -- Verify student belongs to section
  if not exists (
    select 1 from public.students where id = p_student_id and section_id = p_section_id
  ) then
    raise exception 'Student is not in this section';
  end if;

  -- Verify student ID number if the roster has IDs configured
  if p_student_id_num is not null and exists (
    select 1 from public.students where id = p_student_id and student_id_num is not null
  ) then
    if not public.iot_verify_student_id(p_student_id, p_student_id_num) then
      raise exception 'Student ID number does not match. Please check your ID and try again.';
    end if;
  end if;

  -- Verify student not already in an IoT group
  if exists (
    select 1 from public.iot_group_members igm
    join public.iot_groups ig on ig.id = igm.group_id
    where igm.student_id = p_student_id and ig.section_id = p_section_id
  ) then
    raise exception 'You are already in a group';
  end if;

  -- Validate group name
  if trim(coalesce(p_group_name, '')) = '' then
    raise exception 'Group name is required';
  end if;

  insert into public.iot_groups (section_id, name, project_title, owner_student_id)
  values (p_section_id, trim(p_group_name), coalesce(trim(p_project_title), ''), p_student_id)
  returning id into v_group_id;

  insert into public.iot_group_members (group_id, student_id) values (v_group_id, p_student_id);

  return public._iot_groups_for_section(p_section_id);
end;
$$;

-- iot_join_group: anon, verify in section, not in group, group < 5
drop function if exists public.iot_join_group(uuid, uuid);
drop function if exists public.iot_join_group(uuid, uuid, text);
create function public.iot_join_group(p_group_id uuid, p_student_id uuid, p_student_id_num text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.iot_groups%rowtype;
  v_count int;
begin
  select * into v_group from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;

  -- Verify student belongs to same section
  if not exists (
    select 1 from public.students where id = p_student_id and section_id = v_group.section_id
  ) then
    raise exception 'Student is not in this section';
  end if;

  -- Verify student ID number if roster has IDs
  if p_student_id_num is not null and exists (
    select 1 from public.students where id = p_student_id and student_id_num is not null
  ) then
    if not public.iot_verify_student_id(p_student_id, p_student_id_num) then
      raise exception 'Student ID number does not match. Please check your ID and try again.';
    end if;
  end if;

  -- Verify student not already in a group in this section
  if exists (
    select 1 from public.iot_group_members igm
    join public.iot_groups ig on ig.id = igm.group_id
    where igm.student_id = p_student_id and ig.section_id = v_group.section_id
  ) then
    raise exception 'You are already in a group';
  end if;

  -- Verify group not full (max 5)
  select count(*) into v_count from public.iot_group_members where group_id = p_group_id;
  if v_count >= 5 then raise exception 'Group is already full'; end if;

  insert into public.iot_group_members (group_id, student_id) values (p_group_id, p_student_id);

  return public._iot_groups_for_section(v_group.section_id);
end;
$$;

-- iot_update_group_title: verify student is in the group
drop function if exists public.iot_update_group_title(uuid, uuid, text);
create function public.iot_update_group_title(
  p_group_id uuid,
  p_student_id uuid,
  p_project_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.iot_groups%rowtype;
begin
  select * into v_group from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;

  if not exists (
    select 1 from public.iot_group_members
    where group_id = p_group_id and student_id = p_student_id
  ) then
    raise exception 'You are not a member of this group';
  end if;

  update public.iot_groups set project_title = coalesce(trim(p_project_title), '') where id = p_group_id;

  return public._iot_groups_for_section(v_group.section_id);
end;
$$;

drop function if exists public.iot_update_group(uuid, uuid, text, text, text);
create function public.iot_update_group(
  p_group_id uuid,
  p_actor_student_id uuid,
  p_group_name text,
  p_project_title text,
  p_actor_student_id_num text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.iot_groups%rowtype;
  v_name text;
begin
  select * into v_group from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;

  if v_group.owner_student_id is distinct from p_actor_student_id then
    raise exception 'Only the group creator can edit group details';
  end if;

  if p_actor_student_id_num is not null and exists (
    select 1 from public.students where id = p_actor_student_id and student_id_num is not null
  ) then
    if not public.iot_verify_student_id(p_actor_student_id, p_actor_student_id_num) then
      raise exception 'Student ID number does not match. Please check your ID and try again.';
    end if;
  end if;

  v_name := trim(coalesce(p_group_name, ''));
  if v_name = '' then
    raise exception 'Group name is required';
  end if;

  update public.iot_groups
  set name = v_name,
      project_title = coalesce(trim(p_project_title), '')
  where id = p_group_id;

  return public._iot_groups_for_section(v_group.section_id);
end;
$$;

drop function if exists public.iot_add_member(uuid, uuid, uuid, text);
create function public.iot_add_member(
  p_group_id uuid,
  p_actor_student_id uuid,
  p_target_student_id uuid,
  p_actor_student_id_num text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.iot_groups%rowtype;
  v_count int;
begin
  select * into v_group from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;

  if v_group.owner_student_id is distinct from p_actor_student_id then
    raise exception 'Only the group creator can add members';
  end if;

  if p_actor_student_id_num is not null and exists (
    select 1 from public.students where id = p_actor_student_id and student_id_num is not null
  ) then
    if not public.iot_verify_student_id(p_actor_student_id, p_actor_student_id_num) then
      raise exception 'Student ID number does not match. Please check your ID and try again.';
    end if;
  end if;

  if not exists (
    select 1 from public.students where id = p_target_student_id and section_id = v_group.section_id
  ) then
    raise exception 'Student is not in this section';
  end if;

  if exists (
    select 1 from public.iot_group_members igm
    join public.iot_groups ig on ig.id = igm.group_id
    where igm.student_id = p_target_student_id and ig.section_id = v_group.section_id
  ) then
    raise exception 'Student is already in a group';
  end if;

  select count(*) into v_count from public.iot_group_members where group_id = p_group_id;
  if v_count >= 5 then raise exception 'Group is already full'; end if;

  insert into public.iot_group_members (group_id, student_id) values (p_group_id, p_target_student_id);
  return public._iot_groups_for_section(v_group.section_id);
end;
$$;

drop function if exists public.iot_remove_member(uuid, uuid, uuid, text);
create function public.iot_remove_member(
  p_group_id uuid,
  p_actor_student_id uuid,
  p_target_student_id uuid,
  p_actor_student_id_num text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.iot_groups%rowtype;
  v_next_owner uuid;
begin
  select * into v_group from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;

  if p_actor_student_id_num is not null and exists (
    select 1 from public.students where id = p_actor_student_id and student_id_num is not null
  ) then
    if not public.iot_verify_student_id(p_actor_student_id, p_actor_student_id_num) then
      raise exception 'Student ID number does not match. Please check your ID and try again.';
    end if;
  end if;

  if not exists (
    select 1 from public.iot_group_members where group_id = p_group_id and student_id = p_target_student_id
  ) then
    raise exception 'Student is not in this group';
  end if;

  if p_actor_student_id <> p_target_student_id and v_group.owner_student_id is distinct from p_actor_student_id then
    raise exception 'Only the group creator can remove other members';
  end if;

  delete from public.iot_group_members where group_id = p_group_id and student_id = p_target_student_id;

  if v_group.owner_student_id = p_target_student_id then
    select igm.student_id into v_next_owner
    from public.iot_group_members igm
    where igm.group_id = p_group_id
    order by igm.created_at, igm.student_id
    limit 1;

    if v_next_owner is null then
      delete from public.iot_groups where id = p_group_id;
      return public._iot_groups_for_section(v_group.section_id);
    end if;

    update public.iot_groups
    set owner_student_id = v_next_owner
    where id = p_group_id;
  end if;

  return public._iot_groups_for_section(v_group.section_id);
end;
$$;

-- teacher_iot_section_detail: all IoT groups with members for teacher view
drop function if exists public.teacher_iot_section_detail(uuid);
create function public.teacher_iot_section_detail(p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_section_teacher(p_section_id) then
    raise exception 'Not allowed';
  end if;
  return public._iot_groups_for_section(p_section_id);
end;
$$;

-- teacher_iot_remove_group
drop function if exists public.teacher_iot_remove_group(uuid);
create function public.teacher_iot_remove_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
begin
  select section_id into v_section_id from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if not public.is_section_teacher(v_section_id) then raise exception 'Not allowed'; end if;
  delete from public.iot_groups where id = p_group_id;
end;
$$;

-- teacher_iot_remove_member
drop function if exists public.teacher_iot_remove_member(uuid, uuid);
create function public.teacher_iot_remove_member(p_group_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
begin
  select section_id into v_section_id from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if not public.is_section_teacher(v_section_id) then raise exception 'Not allowed'; end if;
  delete from public.iot_group_members where group_id = p_group_id and student_id = p_student_id;
  return public._iot_groups_for_section(v_section_id);
end;
$$;

-- teacher_iot_update_group
drop function if exists public.teacher_iot_update_group(uuid, text, text);
create function public.teacher_iot_update_group(p_group_id uuid, p_name text, p_project_title text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
begin
  select section_id into v_section_id from public.iot_groups where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if not public.is_section_teacher(v_section_id) then raise exception 'Not allowed'; end if;
  update public.iot_groups
  set name = coalesce(trim(p_name), name),
      project_title = coalesce(p_project_title, project_title)
  where id = p_group_id;
  return public._iot_groups_for_section(v_section_id);
end;
$$;

-- teacher_iot_move_member
drop function if exists public.teacher_iot_move_member(uuid, uuid);
create function public.teacher_iot_move_member(p_student_id uuid, p_target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section uuid;
  v_target public.iot_groups%rowtype;
  v_count int;
begin
  select section_id into v_section from public.students where id = p_student_id;
  select * into v_target from public.iot_groups where id = p_target_group_id;
  if v_section is null or not found or v_target.section_id <> v_section then
    raise exception 'Invalid move';
  end if;
  if not public.is_section_teacher(v_section) then raise exception 'Not allowed'; end if;
  select count(*) into v_count from public.iot_group_members where group_id = p_target_group_id;
  if v_count >= 5 then raise exception 'Target group is full'; end if;
  delete from public.iot_group_members where student_id = p_student_id;
  insert into public.iot_group_members (group_id, student_id) values (p_target_group_id, p_student_id);
end;
$$;
