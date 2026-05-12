// Mnesti — Exam Good Luck Email
// Sent at 08:00 on exam day if the user has:
//   - completed ≥ 70% of study days
//   - reached ≥ 65% preparation score
//
// Required Supabase secrets:
//   RESEND_API_KEY            — Resend sending key
//   SUPABASE_SERVICE_ROLE_KEY — to verify JWT and fetch user email

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const SB_URL     = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FROM_EMAIL = 'Mnesti <noreply@mnesti.it>'

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

  // ── Build motivational bar (text-safe) ─────────────────────────────────────
  const barFill  = (pct: number) => Math.round(pct / 100 * 20) // out of 20 chars
  const studyBar = '█'.repeat(barFill(studioPct)) + '░'.repeat(20 - barFill(studioPct))
  const readBar  = '█'.repeat(barFill(readiness)) + '░'.repeat(20 - barFill(readiness))

  // ── Build email HTML ────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:520px;width:100%;">

        <!-- Header bar -->
        <tr>
          <td style="background:#d97757;padding:20px 32px;">
            <span style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">mnesti</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 8px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#d97757;">
              Oggi è il grande giorno
            </p>
            <h1 style="margin:0 0 20px;font-size:24px;font-weight:800;color:#1a1a1a;line-height:1.25;letter-spacing:-0.02em;">
              In bocca al lupo${userName ? ',<br>' + userName : ''}!
            </h1>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.7;">
              Oggi dai l'esame di <strong>${subject}</strong>${professor ? ` con ${professor}` : ''}${examDateDisplay ? ` — <strong>${examDateDisplay}</strong>` : ''}.
              Hai lavorato sodo per arrivare fin qui e i numeri lo dimostrano.
            </p>
          </td>
        </tr>

        <!-- Stats card -->
        <tr>
          <td style="padding:0 32px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8f8f8;border-radius:8px;border:1px solid #ebebeb;overflow:hidden;">
              <tr>
                <td style="padding:20px 24px 8px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#888;">
                    Il tuo percorso
                  </p>
                </td>
              </tr>

              <!-- Giorni di studio -->
              <tr>
                <td style="padding:8px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;">Giorni di studio completati</td>
                      <td align="right" style="font-size:14px;font-weight:700;color:#1a1a1a;">${studioPct}%</td>
                    </tr>
                  </table>
                  <div style="margin-top:6px;background:#e8e8e8;border-radius:4px;height:6px;overflow:hidden;">
                    <div style="background:#d97757;height:6px;width:${studioPct}%;border-radius:4px;"></div>
                  </div>
                </td>
              </tr>

              <!-- Preparazione -->
              <tr>
                <td style="padding:12px 24px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;">Livello di preparazione</td>
                      <td align="right" style="font-size:14px;font-weight:700;color:#1a1a1a;">${readiness}%</td>
                    </tr>
                  </table>
                  <div style="margin-top:6px;background:#e8e8e8;border-radius:4px;height:6px;overflow:hidden;">
                    <div style="background:#6c9e6e;height:6px;width:${readiness}%;border-radius:4px;"></div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Message -->
        <tr>
          <td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:14px;color:#444;line-height:1.75;border-left:3px solid #d97757;padding-left:16px;font-style:italic;">
              "Hai usato il metodo giusto — active recall, ripetizioni, autovalutazione.
              Fidati del lavoro che hai fatto e vai sereno."
            </p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 32px;">
            <a href="https://app.mnesti.it"
               style="display:inline-block;background:#d97757;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.01em;">
              Apri Mnesti
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f8;border-top:1px solid #ebebeb;padding:16px 32px;">
            <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">
              Email automatica inviata alle 08:00 del giorno dell'esame &middot;
              Mnesti ti manda in bocca al lupo!
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  // ── Send via Resend ─────────────────────────────────────────────────────────
  if (!RESEND_KEY) {
    console.error('[exam-goodluck] RESEND_API_KEY not set')
    return new Response(JSON.stringify({ error: 'email service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
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
        from:    FROM_EMAIL,
        to:      [userEmail],
        subject: `In bocca al lupo! Oggi e' il giorno di ${subject}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend ${res.status}: ${err}`)
    }

    const data = await res.json()
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
