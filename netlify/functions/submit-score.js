const { supabase } = require('./_utils/supabase');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { deviceId, score, playMs } = JSON.parse(event.body || '{}');
    if (!deviceId || typeof score !== 'number') {
      return { statusCode: 400, body: 'deviceId and numeric score are required' };
    }

    // Get the current name for this device (snapshot it into the score row)
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('name')
      .eq('device_id', deviceId)
      .single();

    if (profErr || !prof) {
      return { statusCode: 400, body: JSON.stringify({ error: 'unknown device' }) };
    }

    const insert = {
      device_id: deviceId,
      name: prof.name,
      score,
      // optionally store playMs, e.g. as a column you added
      // play_ms: playMs || null,
    };

    const { error } = await supabase.from('scores').insert(insert);
    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
