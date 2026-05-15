// Mnesti — Auth Send Email Hook
//
// Supabase calls this Edge Function instead of sending the default auth email.
// Handles: signup confirmation, password recovery, magic link, email change.
//
// Configure in Supabase Dashboard:
//   Authentication → Hooks → Send Email → Edge Function → auth-send-email
//
// Required secret:
//   RESEND_API_KEY — Resend API key

import { baseLayout, sendViaResend, FROM_EMAIL } from '../_shared/email-layout.ts'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

interface EmailData {
  token:             string
  token_hash:        string
  redirect_to:       string
  email_action_type: 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change'
  site_url:          string
  token_new?:        string
  token_hash_new?:   string
}

interface HookPayload {
  user:       { id: string; email: string }
  email_data: EmailData
}

// Build the Supabase verify URL for the given action
function verifyUrl(emailData: EmailData): string {
  const base = `${emailData.site_url}/auth/v1/verify`
  const params = new URLSearchParams({
    token_hash: emailData.token_hash,
    type:       emailData.email_action_type,
  })
  if (emailData.redirect_to) params.set('redirect_to', emailData.redirect_to)
  return `${base}?${params.toString()}`
}

// ── Email builders ─────────────────────────────────────────────────────────────

function signupEmail(user: HookPayload['user'], actionUrl: string): string {
  const inner = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e7e0d8;letter-spacing:-0.02em;">
      Conferma la tua email
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:#a8a099;line-height:1.6;">
      Benvenuto su Mnesti! Clicca il pulsante qui sotto per attivare il tuo account.
    </p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#d97757;color:#ffffff;text-decoration:none;
              font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;
              letter-spacing:-0.01em;">
      Conferma email
    </a>
    <p style="margin:28px 0 0;font-size:12px;color:#65605b;line-height:1.6;">
      Se non hai creato un account Mnesti puoi ignorare questa email.<br>
      Il link scade tra 24 ore.
    </p>
  `
  return baseLayout(inner)
}

function recoveryEmail(user: HookPayload['user'], actionUrl: string): string {
  const inner = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e7e0d8;letter-spacing:-0.02em;">
      Reimposta la password
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:#a8a099;line-height:1.6;">
      Hai richiesto di reimpostare la password del tuo account Mnesti.<br>
      Clicca il pulsante qui sotto per procedere.
    </p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#d97757;color:#ffffff;text-decoration:none;
              font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;
              letter-spacing:-0.01em;">
      Reimposta password
    </a>
    <p style="margin:28px 0 0;font-size:12px;color:#65605b;line-height:1.6;">
      Se non hai richiesto questo, puoi ignorare questa email in tutta sicurezza.<br>
      Il link scade tra 1 ora.
    </p>
  `
  return baseLayout(inner)
}

function magiclinkEmail(user: HookPayload['user'], actionUrl: string): string {
  const inner = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e7e0d8;letter-spacing:-0.02em;">
      Il tuo link di accesso
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:#a8a099;line-height:1.6;">
      Clicca il pulsante qui sotto per accedere a Mnesti. Il link è valido per un solo utilizzo.
    </p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#d97757;color:#ffffff;text-decoration:none;
              font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;
              letter-spacing:-0.01em;">
      Accedi a Mnesti
    </a>
    <p style="margin:28px 0 0;font-size:12px;color:#65605b;line-height:1.6;">
      Se non hai richiesto questo link puoi ignorare questa email.<br>
      Il link scade tra 1 ora.
    </p>
  `
  return baseLayout(inner)
}

function inviteEmail(user: HookPayload['user'], actionUrl: string): string {
  const inner = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e7e0d8;letter-spacing:-0.02em;">
      Sei stato invitato su Mnesti
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:#a8a099;line-height:1.6;">
      Clicca il pulsante qui sotto per accettare l'invito e creare il tuo account.
    </p>
    <a href="${actionUrl}"
       style="display:inline-block;background:#d97757;color:#ffffff;text-decoration:none;
              font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;
              letter-spacing:-0.01em;">
      Accetta invito
    </a>
    <p style="margin:28px 0 0;font-size:12px;color:#65605b;line-height:1.6;">
      Il link scade tra 24 ore.
    </p>
  `
  return baseLayout(inner)
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let payload: HookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { user, email_data } = payload
  const actionUrl = verifyUrl(email_data)

  const subjects: Record<string, string> = {
    signup:       'Conferma la tua email — Mnesti',
    recovery:     'Reimposta la password — Mnesti',
    magiclink:    'Il tuo link di accesso — Mnesti',
    invite:       'Sei invitato su Mnesti',
    email_change: 'Conferma il cambio email — Mnesti',
  }

  const htmlBuilders: Record<string, (u: typeof user, url: string) => string> = {
    signup:       signupEmail,
    recovery:     recoveryEmail,
    magiclink:    magiclinkEmail,
    invite:       inviteEmail,
    email_change: signupEmail, // reuse confirm layout
  }

  const type    = email_data.email_action_type
  const subject = subjects[type]   ?? 'Mnesti'
  const builder = htmlBuilders[type] ?? signupEmail
  const html    = builder(user, actionUrl)

  if (!RESEND_KEY) {
    console.error('[auth-send-email] RESEND_API_KEY not set')
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await sendViaResend(RESEND_KEY, user.email, subject, html)
    console.info(`[auth-send-email] type=${type} to=${user.email} id=${result.id}`)
    return new Response(JSON.stringify({ sent: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[auth-send-email] Send failed:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
