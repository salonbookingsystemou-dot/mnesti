// Mnesti — Lifecycle Emails
// Handles two automated transactional emails:
//   1. no_exam_nudge   — sent once, ~24h after signup, if user hasn't created an exam
//   2. daily_reminder  — sent every morning to users with an upcoming exam (countdown)
//
// Triggered by pg_cron via pg_net HTTP POST.
// Required Supabase secrets:
//   RESEND_API_KEY          — Resend sending key
//   SUPABASE_SERVICE_ROLE_KEY — to query DB bypassing RLS
//   CRON_SECRET             — shared secret to authenticate pg_cron calls

import { baseLayout, sendViaResend, APP_URL } from '../_shared/email-layout.ts'

const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')               ?? ''
const SB_URL        = Deno.env.get('SUPABASE_URL')                 ?? ''
const SB_SERVICE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')    ?? ''
const CRON_SECRET   = Deno.env.get('CRON_SECRET')                  ?? ''

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sbRpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SB_SERVICE,
      'Authorization': `Bearer ${SB_SERVICE}`,
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${await res.text()}`)
  return res.json() as Promise<T[]>
}

async function logEmail(userId: string, emailType: string): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/email_log`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SB_SERVICE,
      'Authorization': `Bearer ${SB_SERVICE}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ user_id: userId, email_type: emailType }),
  })
  if (!res.ok) console.warn('[lifecycle-emails] log failed:', await res.text())
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const data = await sendViaResend(RESEND_KEY, to, subject, html)
  console.info('[lifecycle-emails] sent to', to, '— id:', data.id)
}

// ── Email Templates ───────────────────────────────────────────────────────────

function noExamNudgeHtml(): string {
  return baseLayout(`
    <p style="text-align:center;font-size:32px;margin:0 0 20px;">📚</p>

    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#f0ebe6;text-align:center;letter-spacing:-0.02em;line-height:1.3;">
      Il tuo piano di studio ti aspetta
    </h1>
    <p style="margin:0 0 28px;font-size:14px;color:#888888;text-align:center;line-height:1.7;">
      Hai creato il tuo account ieri, ma non hai ancora configurato il tuo esame.<br>
      Ci vogliono meno di 2 minuti — poi Mnesti costruisce un piano su misura per te.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#d97757;letter-spacing:0.05em;text-transform:uppercase;">Con Mnesti puoi</p>
          <ul style="margin:0;padding:0 0 0 16px;font-size:13px;color:#999999;line-height:1.9;">
            <li>Rispondere a domande aperte verificate dall'AI</li>
            <li>Allenarti con quiz tematici</li>
            <li>Memorizzare teorie e autori con le Memory Cards</li>
            <li>Chiedere chiarimenti all'assistente vocale AI</li>
          </ul>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${APP_URL}"
           style="display:inline-block;background:#d97757;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.01em;">
          Configura il mio esame →
        </a>
      </td></tr>
    </table>
  `)
}

function dailyReminderHtml(examName: string, daysRemaining: number): string {
  const urgencyMsg =
    daysRemaining > 30 ? 'Stai costruendo le basi. Costanza prima di tutto.' :
    daysRemaining > 14 ? 'È il momento di intensificare il ritmo.' :
    daysRemaining > 7  ? 'Meno di due settimane. Dai il massimo ogni giorno.' :
    daysRemaining > 3  ? 'Ultimi giorni — concentrati e non mollare.' :
                         'Ci siamo quasi. Confida in quello che hai studiato.'

  const countdownColor =
    daysRemaining > 14 ? '#d97757' :
    daysRemaining > 7  ? '#e8a87c' :
                         '#f0c080'

  const dayLabel = daysRemaining === 1 ? 'giorno' : 'giorni'

  return baseLayout(`
    <p style="text-align:center;margin:0 0 8px;">
      <span style="font-size:52px;font-weight:800;color:${countdownColor};letter-spacing:-0.04em;line-height:1;">${daysRemaining}</span>
    </p>
    <p style="text-align:center;font-size:13px;color:#666666;margin:0 0 24px;text-transform:uppercase;letter-spacing:0.1em;">
      ${dayLabel} all'esame
    </p>

    <hr style="border:none;border-top:1px solid #2a2a2a;margin:0 0 24px;">

    <h1 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#f0ebe6;text-align:center;letter-spacing:-0.02em;line-height:1.3;">
      ${examName}
    </h1>
    <p style="margin:0 0 28px;font-size:14px;color:#777777;text-align:center;line-height:1.6;">
      ${urgencyMsg}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${APP_URL}"
           style="display:inline-block;background:#d97757;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.01em;">
          Continua il piano di studio →
        </a>
      </td></tr>
    </table>
  `)
}

// ── Handlers ─────────────────────────────────────────────────────────────────

type NudgeTarget = { user_id: string; email: string }
type ReminderTarget = {
  user_id: string; email: string
  exam_name: string; exam_date: string; days_remaining: number
}

async function handleNoExamNudge(): Promise<{ sent: number; errors: number }> {
  const targets = await sbRpc<NudgeTarget>('get_no_exam_nudge_targets')
  console.info('[no_exam_nudge] targets:', targets.length)

  let sent = 0, errors = 0
  for (const t of targets) {
    try {
      await sendEmail(
        t.email,
        'Il tuo piano di studio ti aspetta — configura il tuo esame',
        noExamNudgeHtml(),
      )
      await logEmail(t.user_id, 'no_exam_nudge')
      sent++
    } catch (e) {
      console.error('[no_exam_nudge] failed for', t.email, e)
      errors++
    }
  }
  return { sent, errors }
}

async function handleDailyReminder(): Promise<{ sent: number; errors: number }> {
  const targets = await sbRpc<ReminderTarget>('get_daily_reminder_targets')
  console.info('[daily_reminder] targets:', targets.length)

  let sent = 0, errors = 0
  for (const t of targets) {
    const days = Math.max(0, t.days_remaining)
    try {
      await sendEmail(
        t.email,
        `${days} ${days === 1 ? 'giorno' : 'giorni'} all'esame di ${t.exam_name} — studia con Mnesti`,
        dailyReminderHtml(t.exam_name, days),
      )
      await logEmail(t.user_id, 'daily_reminder')
      sent++
    } catch (e) {
      console.error('[daily_reminder] failed for', t.email, e)
      errors++
    }
  }
  return { sent, errors }
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Auth: accept calls from pg_cron (via CRON_SECRET) or service role header
  const incomingSecret = req.headers.get('x-cron-secret') ?? ''
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    console.warn('[lifecycle-emails] Unauthorized')
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { type?: string } = {}
  try { body = await req.json() } catch { /* empty body = run both */ }

  const type = body.type ?? 'all'
  const results: Record<string, unknown> = {}

  if (type === 'no_exam_nudge' || type === 'all') {
    results.no_exam_nudge = await handleNoExamNudge()
  }
  if (type === 'daily_reminder' || type === 'all') {
    results.daily_reminder = await handleDailyReminder()
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
