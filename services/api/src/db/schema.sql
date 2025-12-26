create table if not exists runs (
  run_id text primary key,
  name text,
  created_at text not null,
  status text not null,
  request_json text not null,
  summary_json text,
  error_message text
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
create table if not exists stat_tests (
  id integer primary key autoincrement,
  run_id text not null,
  test_type text not null,
  p_value real,
  confidence_level real,
  in_sample_metric real,
  out_sample_metric real,
  metadata_json text,
  created_at text default current_timestamp,
  foreign key(run_id) references runs(run_id)
);
