// netlify/functions/register-identity.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const MAX_NAME_LEN = 16;

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { deviceId, name } = req.body || {};
  const cleanId = String(deviceId || '').slice(0, 64).trim();
  const cleanName = String(name || '').slice(0, MAX_NAME_LEN).trim();

  if (!cleanId)  return res.status(400).json({ error: 'deviceId required' });
  if (!cleanName) return res.status(400).json({ error: 'name required' });

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { device_id: cleanId, name: cleanName, updated_at: new Date().toISOString() },
      { onConflict: 'device_id' }
    )
    .select('device_id, name')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, profile: data });
};
