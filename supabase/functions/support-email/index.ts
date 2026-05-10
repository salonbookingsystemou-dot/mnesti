// Mnesti — Support Email
// Called from the AI tutor when the user needs human support.
// Sends an email to the admin with the user's message;
// reply-to is set to the user's email so the admin can reply directly.
//
// Required Supabase secrets:
//   RESEND_API_KEY           — Resend sending key
//   SUPABASE_SERVICE_ROLE_KEY — to verify JWT and fetch user email

const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')            ?? ''
const SB_URL       = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_SERVICE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FROM_EMAIL   = 'Mnesti <noreply@mnesti.it>'
const ADMIN_EMAIL  = 'contact@wordpresschef.it'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'content-type, authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Get user from JWT ───────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()

  let userEmail = 'utente sconosciuto'
  let userId    = null

  if (token && SB_SERVICE) {
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': SB_SERVICE,
        },
      })
      if (res.ok) {
        const data = await res.json()
        userEmail  = data.email  ?? userEmail
        userId     = data.id     ?? null
      }
    } catch (e) {
      console.warn('[support-email] Could not fetch user:', e)
    }
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { message?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const message = (body.message ?? '').trim()
  if (!message) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const dateStr = new Date().toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // ── Build email ─────────────────────────────────────────────────────────────
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <div style="margin-bottom:20px;">
        <span style="font-size:18px;font-weight:800;letter-spacing:-0.03em;color:#d97757;">mnesti</span>
        <span style="font-size:12px;color:#888;margin-left:10px;">richiesta di supporto</span>
      </div>

      <h2 style="font-size:16px;font-weight:700;margin:0 0 16px;">Nuovo messaggio di supporto</h2>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 0;color:#888;width:80px;">Da</td>
          <td style="padding:8px 0;font-weight:600;">${userEmail}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 0;color:#888;">Data</td>
          <td style="padding:8px 0;">${dateStr}</td>
        </tr>
        ${userId ? `<tr><td style="padding:8px 0;color:#888;">User ID</td><td style="padding:8px 0;font-size:11px;font-family:monospace;color:#aaa;">${userId}</td></tr>` : ''}
      </table>

      <div style="background:#f8f8f8;border-left:3px solid #d97757;border-radius:4px;padding:14px 16px;font-size:14px;line-height:1.65;color:#1a1a1a;margin-bottom:24px;">
        ${message.replace(/\n/g, '<br>')}
      </div>

      <a href="mailto:${userEmail}?subject=Re: la tua domanda su Mnesti"
         style="display:inline-block;background:#d97757;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;">
        Rispondi a ${userEmail}
      </a>

      <p style="margin-top:24px;font-size:11px;color:#aaa;">
        Notifica automatica da Mnesti — rispondi direttamente a questa email per contattare l'utente.
      </p>
    </div>
  `

  // ── Send via Resend ─────────────────────────────────────────────────────────
  if (!RESEND_KEY) {
    console.error('[support-email] RESEND_API_KEY not set')
    return new Response(JSON.stringify({ error: 'email service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       [ADMIN_EMAIL],
        reply_to: userEmail !== 'utente sconosciuto' ? userEmail : undefined,
        subject:  `💬 Supporto Mnesti da ${userEmail}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend ${res.status}: ${err}`)
    }

    const data = await res.json()
    console.info('[support-email] sent, id:', data.id, 'from:', userEmail)

    return new Response(JSON.stringify({ sent: true, id: data.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[support-email] send failed:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
