// netlify/functions/submit-coin.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { deviceId, delta } = JSON.parse(event.body || '{}');
    if (!deviceId || !Number.isFinite(delta)) {
      return { statusCode: 400, body: 'Bad request' };
    }

    // TODO: persist coin total for this deviceId:
    // Example pseudocode:
    // const user = await db.get(deviceId);
    // const coins = (user?.coins || 0) + delta;
    // await db.set(deviceId, { ...user, coins });

    return {
      statusCode: 200,
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ ok:true })
    };
  } catch (e) {
    return { statusCode: 500, body: 'Server error' };
  }
};
