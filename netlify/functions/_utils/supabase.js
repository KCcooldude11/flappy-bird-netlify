// CommonJS helper for Supabase in Netlify functions
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !serviceRole) {
  // Crash early with a clear error (will show in function logs)
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env vars');
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false },
});

module.exports = { supabase };
