// Mnesti — Exam Good Luck Email
// Sent at 08:00 on exam day if the user has:
//   - completed ≥ 70% of study days
//   - reached ≥ 65% preparation score
//
// Required Supabase secrets:
//   RESEND_API_KEY            — Resend sending key
//   SUPABASE_SERVICE_ROLE_KEY — to verify JWT and fetch user email

import { baseLayout, sendViaResend, APP_URL } from '../_shared/email-layout.ts'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const SB_URL     = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Verify JWT and get user email ───────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token      = authHeader.replace('Bearer ', '').trim()

  let userEmail = ''
  let userName  = ''

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
        userEmail  = data.email ?? ''
        userName   = data.user_metadata?.full_name ?? data.email?.split('@')[0] ?? ''
      }
    } catch (e) {
      console.warn('[exam-goodluck] Could not fetch user:', e)
    }
  }

  if (!userEmail) {
    return new Response(JSON.stringify({ error: 'user not found' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  // ── Parse payload ───────────────────────────────────────────────────────────
  let body: {
    subject?:   string
    professor?: string
    studioPct?: number
    readiness?: number
    examDate?:  string
  } = {}
  try { body = await req.json() } catch { /* empty */ }

  const subject   = (body.subject   ?? 'il tuo esame').trim()
  const professor = (body.professor ?? '').trim()
  const studioPct = Math.round(body.studioPct ?? 0)
  const readiness = Math.round(body.readiness ?? 0)

  // Format exam date for display
  let examDateDisplay = ''
  if (body.examDate) {
    try {
      const [y, m, d] = body.examDate.split('-').map(Number)
      examDateDisplay = new Date(y, m - 1, d).toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    } catch { /* ignore */ }
  }

  // ── Build email HTML via shared baseLayout ─────────────────────────────────
  const html = baseLayout(`
    <p style="text-align:center;margin:0 0 4px;">
      <span style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#d97757;">
        Oggi è il grande giorno
      </span>
    </p>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0ebe6;text-align:center;letter-spacing:-0.02em;line-height:1.3;">
      In bocca al lupo${userName ? ', ' + userName : ''}!
    </h1>

    <hr style="border:none;border-top:1px solid #2a2a2a;margin:20px 0;">

    <p style="margin:0 0 20px;font-size:14px;color:#888888;text-align:center;line-height:1.7;">
      Oggi dai l'esame di <strong style="color:#f0ebe6;">${subject}</strong>${professor ? ` con <strong style="color:#f0ebe6;">${professor}</strong>` : ''}${examDateDisplay ? `<br>${examDateDisplay}` : ''}.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:16px 20px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#555555;letter-spacing:0.08em;text-transform:uppercase;">Il tuo percorso</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
            <tr>
              <td style="font-size:13px;color:#888888;">Giorni completati</td>
              <td align="right" style="font-size:13px;font-weight:700;color:#f0ebe6;">${studioPct}%</td>
            </tr>
          </table>
          <div style="background:#2a2a2a;border-radius:4px;height:5px;overflow:hidden;margin-bottom:14px;">
            <div style="background:#d97757;height:5px;width:${studioPct}%;border-radius:4px;"></div>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;color:#888888;">Preparazione</td>
              <td align="right" style="font-size:13px;font-weight:700;color:#f0ebe6;">${readiness}%</td>
            </tr>
          </table>
          <div style="background:#2a2a2a;border-radius:4px;height:5px;overflow:hidden;margin-top:6px;">
            <div style="background:#4a9e6e;height:5px;width:${readiness}%;border-radius:4px;"></div>
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px;font-size:13px;color:#666666;text-align:center;line-height:1.75;font-style:italic;">
      "Hai usato il metodo giusto — active recall, ripetizioni, autovalutazione.<br>
      Fidati del lavoro che hai fatto e vai sereno."
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${APP_URL}"
           style="display:inline-block;background:#d97757;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.01em;">
          Apri Mnesti →
        </a>
      </td></tr>
    </table>
  `)

  // ── Send via Resend ─────────────────────────────────────────────────────────
  if (!RESEND_KEY) {
    console.error('[exam-goodluck] RESEND_API_KEY not set')
    return new Response(JSON.stringify({ error: 'email service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  try {
    const data = await sendViaResend(
      RESEND_KEY,
      userEmail,
      `In bocca al lupo! Oggi e' il giorno di ${subject}`,
      html,
    )
    console.info('[exam-goodluck] sent to:', userEmail, 'id:', data.id)

    return new Response(JSON.stringify({ sent: true, id: data.id }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (err) {
    console.error('[exam-goodluck] send failed:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})
