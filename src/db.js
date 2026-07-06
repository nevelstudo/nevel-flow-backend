const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL belum diset di Railway Variables');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initDb() {
  await pool.query(`
    create extension if not exists pgcrypto;
  `);

  await pool.query(`
    create table if not exists subscribers (
      id uuid primary key default gen_random_uuid(),
      wa_number varchar(30) not null unique,
      full_name varchar(255) not null,
      email varchar(255),
      product_name varchar(255),
      spreadsheet_id varchar(255),
      subscription_status varchar(50) not null default 'active',
      registered_at timestamptz not null default now(),
      expired_at timestamptz not null,
      renew_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    alter table subscribers
    add column if not exists spreadsheet_id varchar(255);
  `);

  await pool.query(`
    create table if not exists webhook_events (
      id uuid primary key default gen_random_uuid(),
      source varchar(50) not null,
      event_id varchar(255) not null,
      payload_json jsonb not null,
      status varchar(50) not null default 'received',
      processed_at timestamptz not null default now(),
      unique(source, event_id)
    );
  `);
}

module.exports = {
  pool,
  initDb
};
