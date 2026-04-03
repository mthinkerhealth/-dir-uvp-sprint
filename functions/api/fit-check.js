export async function onRequestPost(context) {
  try {
    const webhookUrl = context.env.APPS_SCRIPT_WEBHOOK_URL;

    if (!webhookUrl) {
      return Response.json({ ok: false, error: 'Missing APPS_SCRIPT_WEBHOOK_URL' }, { status: 500 });
    }

    const payload = await context.request.json();

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return Response.json({ ok: false, error: 'Apps Script returned non-JSON response', raw: text.slice(0, 500) }, { status: 502 });
    }

    return Response.json(data, { status: response.ok ? 200 : 502 });
  } catch (err) {
    return Response.json(
      { ok: false, error: err && err.message ? err.message : 'Unknown proxy error' },
      { status: 500 }
    );
  }
}
