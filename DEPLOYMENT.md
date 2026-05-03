# Supabase + Vercel Setup

## 1. Create Supabase Project

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run everything in `supabase_schema.sql`.

## 2. Create Your Teacher Login

1. In Supabase, go to **Authentication > Users**.
2. Create a user for your teacher email.
3. Run this in SQL Editor, replacing the email:

```sql
insert into public.teacher_profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', email)
from auth.users
where email = 'your-email@example.com'
on conflict (id) do nothing;
```

That email can now sign in at `aspnet_teacher_admin.html`.

## 3. Configure The Site

Copy your Supabase project URL and anon public key from **Project Settings > API**.

Edit `supabase-config.js`:

```js
window.ASP_FINAL_PROJECT_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-SUPABASE-ANON-KEY",
  defaultSectionSlug: "bsit-2a"
};
```

## 4. Teacher Workflow

1. Open `aspnet_teacher_admin.html`.
2. Sign in with the Supabase Auth teacher account.
3. Create a section.
4. Paste the roster.
5. Generate 12 claim codes.
6. Give claim codes to group leaders.

Student link format:

```text
aspnet_student_view.html?section=bsit-2a
```

Group dashboard link format:

```text
group_dashboard.html?section=bsit-2a
```

You can also prefill the group code:

```text
group_dashboard.html?section=bsit-2a&code=F80B-F8FA
```

## 5. Vercel Deploy

Because this is static HTML/JS, you can deploy the folder directly.

Recommended:

```bash
vercel
```

Or connect the folder/repo in the Vercel dashboard. The public student page is `aspnet_student_view.html`; the group workspace page is `group_dashboard.html`; the teacher page is `aspnet_teacher_admin.html`.

## Notes

- The Supabase anon key is public by design.
- The one-time code checks, group limits, member limits, and title uniqueness are enforced in Supabase RPC functions.
- For multiple teachers per section, add the second teacher to `teacher_profiles`, then add a row to `section_teachers`.
