/**
 * The Pairings (TCG tournament tracker) Supabase project - a different project from Pawmodoro's,
 * with its own accounts. Copied from Pairings' public config.js. The anon key is meant to ship in
 * client apps (`anon` role only); Pairings' row-level security is what protects each person's data.
 * Never put a `service_role` key here.
 */
export const PAIRINGS_URL = 'https://rkoftnavclopwvewnook.supabase.co'
export const PAIRINGS_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrb2Z0bmF2Y2xvcHd2ZXdub29rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjgwMjksImV4cCI6MjEwMzYwNDAyOX0.oq47ygufpxv7-prk50wQl28VN4D5ilJ6mMRsv7RGNQQ'
