create table if not exists runs (
  run_id text primary key,
  name text,
  created_at text not null,
  status text not null,
  request_json text not null,
  summary_json text
);
create table if not exists artifacts (
  id integer primary key autoincrement,
  run_id text not null,
  kind text not null,
  path text not null,
  checksum text,
  foreign key(run_id) references runs(run_id)
);
create table if not exists datasets (
  id integer primary key autoincrement,
  source text,
  symbol text,
  timeframe text,
  start text,
  end text,
  adjusted integer,
  path text,
  checksum text,
  rows integer,
  created_at text
);
create table if not exists risk_profiles (
  id integer primary key autoincrement,
  name text not null,
  json text not null
);
