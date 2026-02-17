-- Reputation Monitor Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (linked to auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  created_at timestamptz default now()
);

-- Hotels table
create table if not exists hotels (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  city text,
  website_url text,
  google_place_id text,
  tripadvisor_url text,
  expedia_url text,
  booking_url text,
  airbnb_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Review snapshots table
create table if not exists review_snapshots (
  id uuid default uuid_generate_v4() primary key,
  hotel_id uuid references hotels(id) on delete cascade not null,
  channel text not null check (channel in ('google', 'tripadvisor', 'expedia', 'booking', 'airbnb')),
  average_score numeric,
  normalized_score numeric,
  total_reviews integer,
  fetched_at timestamptz default now(),
  raw_response jsonb
);

-- Groups table
create table if not exists groups (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

-- Group-Hotels join table
create table if not exists group_hotels (
  group_id uuid references groups(id) on delete cascade not null,
  hotel_id uuid references hotels(id) on delete cascade not null,
  primary key (group_id, hotel_id)
);

-- Review themes table (for AI stretch feature)
create table if not exists review_themes (
  id uuid default uuid_generate_v4() primary key,
  hotel_id uuid references hotels(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  positive_themes jsonb default '[]'::jsonb,
  negative_themes jsonb default '[]'::jsonb,
  generated_at timestamptz default now(),
  model_used text
);

-- Indexes for performance
create index if not exists idx_hotels_user_id on hotels(user_id);
create index if not exists idx_review_snapshots_hotel_id on review_snapshots(hotel_id);
create index if not exists idx_review_snapshots_channel on review_snapshots(channel);
create index if not exists idx_review_snapshots_fetched_at on review_snapshots(fetched_at);
create index if not exists idx_groups_user_id on groups(user_id);
create index if not exists idx_group_hotels_hotel_id on group_hotels(hotel_id);
create index if not exists idx_review_themes_hotel_id on review_themes(hotel_id);

-- Row Level Security (RLS)
alter table profiles enable row level security;
alter table hotels enable row level security;
alter table review_snapshots enable row level security;
alter table groups enable row level security;
alter table group_hotels enable row level security;
alter table review_themes enable row level security;

-- RLS Policies

-- Profiles: users can read/update their own profile
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Hotels: users can CRUD their own hotels
create policy "Users can view own hotels" on hotels
  for select using (auth.uid() = user_id);
create policy "Users can insert own hotels" on hotels
  for insert with check (auth.uid() = user_id);
create policy "Users can update own hotels" on hotels
  for update using (auth.uid() = user_id);
create policy "Users can delete own hotels" on hotels
  for delete using (auth.uid() = user_id);

-- Review snapshots: users can access snapshots for their hotels
create policy "Users can view own review snapshots" on review_snapshots
  for select using (
    exists (select 1 from hotels where hotels.id = review_snapshots.hotel_id and hotels.user_id = auth.uid())
  );
create policy "Users can insert review snapshots" on review_snapshots
  for insert with check (
    exists (select 1 from hotels where hotels.id = review_snapshots.hotel_id and hotels.user_id = auth.uid())
  );

-- Groups: users can CRUD their own groups
create policy "Users can view own groups" on groups
  for select using (auth.uid() = user_id);
create policy "Users can insert own groups" on groups
  for insert with check (auth.uid() = user_id);
create policy "Users can update own groups" on groups
  for update using (auth.uid() = user_id);
create policy "Users can delete own groups" on groups
  for delete using (auth.uid() = user_id);

-- Group hotels: users can manage memberships for their groups
create policy "Users can view own group hotels" on group_hotels
  for select using (
    exists (select 1 from groups where groups.id = group_hotels.group_id and groups.user_id = auth.uid())
  );
create policy "Users can insert group hotels" on group_hotels
  for insert with check (
    exists (select 1 from groups where groups.id = group_hotels.group_id and groups.user_id = auth.uid())
  );
create policy "Users can delete group hotels" on group_hotels
  for delete using (
    exists (select 1 from groups where groups.id = group_hotels.group_id and groups.user_id = auth.uid())
  );

-- Review themes: users can access themes for their hotels/groups
create policy "Users can view own review themes" on review_themes
  for select using (
    (hotel_id is not null and exists (select 1 from hotels where hotels.id = review_themes.hotel_id and hotels.user_id = auth.uid()))
    or
    (group_id is not null and exists (select 1 from groups where groups.id = review_themes.group_id and groups.user_id = auth.uid()))
  );
create policy "Users can insert review themes" on review_themes
  for insert with check (
    (hotel_id is not null and exists (select 1 from hotels where hotels.id = review_themes.hotel_id and hotels.user_id = auth.uid()))
    or
    (group_id is not null and exists (select 1 from groups where groups.id = review_themes.group_id and groups.user_id = auth.uid()))
  );

-- Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for auto-profile creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at on hotels
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_hotels_updated_at on hotels;
create trigger update_hotels_updated_at
  before update on hotels
  for each row execute procedure public.update_updated_at();
