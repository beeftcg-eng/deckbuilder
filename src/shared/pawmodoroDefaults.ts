/**
 * The shared Pawmodoro Supabase project Deckbuilder connects to out of the
 * box, so a friend only has to enter an email and password.
 *
 * The anon key is meant to ship inside client apps (it carries the `anon`
 * role and nothing more) — what protects each person's data is the
 * row-level security in Pawmodoro's supabase/schema.sql, not this key's
 * secrecy. Never put a `service_role` key here. Keep in sync with
 * Pawmodoro's cloud_defaults.py and docs/app.js.
 */
export const DEFAULT_PAWMODORO_URL = 'https://cinxclbsgamdprftcbek.supabase.co'
export const DEFAULT_PAWMODORO_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpbnhjbGJzZ2FtZHByZnRjYmVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTc4OTIsImV4cCI6MjEwNTEzMzg5Mn0.1hpyBV2ZO3MeQUSnx3K5-XG6BbzY-gXb-4uG6Ls7Fr0'
