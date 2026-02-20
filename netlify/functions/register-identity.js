const { supabase } = require('./_utils/supabase');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { deviceId, name } = JSON.parse(event.body || '{}');
    if (!deviceId || !name) {
      return { statusCode: 400, body: 'deviceId and name are required' };
    }

    const cleanName = String(name).slice(0, 16).trim();
    const { error } = await supabase
      .from('profiles')
      .upsert(
    { device_id: deviceId, name: cleanName },
    { onConflict: 'device_id' }
  );

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
