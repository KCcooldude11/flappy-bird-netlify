// netlify/functions/submit-score.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const MAX_SCORE = 999999;
const MIN_PLAY_MS = 1500; // quick sanity

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { deviceId, score, playMs } = req.body || {};
  const cleanId = String(deviceId || '').slice(0, 64).trim();
  const cleanScore = Number(score);

  if (!cleanId) return res.status(400).json({ error: 'deviceId required' });
  if (!Number.isFinite(cleanScore) || cleanScore < 0 || cleanScore > MAX_SCORE) {
    return res.status(400).json({ error: 'Invalid score' });
  }
  if (Number.isFinite(playMs) && playMs < MIN_PLAY_MS) {
    return res.status(400).json({ error: 'Too fast to be legit' });
  }

  // Get the current name tied to this device
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('name')
    .eq('device_id', cleanId)
    .single();

  if (pErr || !profile) return res.status(400).json({ error: 'Unknown deviceId (register first)' });

  const { data, error } = await supabase
    .from('scores')
    .insert({ device_id: cleanId, name: profile.name, score: cleanScore })
    .select('name, score, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, score: data });
};
