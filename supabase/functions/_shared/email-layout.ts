// Mnesti — Shared transactional email layout
//
// Single source of truth for all user-facing email styling.
// Import with:   import { baseLayout, sendViaResend, FROM_EMAIL, APP_URL } from '../_shared/email-layout.ts'
//
// Logo: served from https://mnesti.it/logo-white.png (GitHub Pages, public URL).
// data: URIs are stripped by Gmail, so we use the public URL instead.
// Gmail proxies external images, but the image will still display correctly.

export const FROM_EMAIL = 'Mnesti <noreply@mnesti.it>'
export const APP_URL    = 'https://mnesti.it/app.html'

const LOGO_SRC = 'https://mnesti.it/logo-white.png'

// ── Base layout ───────────────────────────────────────────────────────────────
export function baseLayout(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;" bgcolor="#0d0d0d">
<div style="background:#0d0d0d;padding:48px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d0d0d"><tr><td align="center" bgcolor="#0d0d0d" style="background-color:#0d0d0d;">
  <table cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;" bgcolor="#0d0d0d">

    <tr><td align="center" bgcolor="#0d0d0d" style="padding-bottom:28px;background-color:#0d0d0d;">
      <img src="${LOGO_SRC}" alt="Mnesti" height="72" width="102" style="display:block;" />
    </td></tr>

    <tr><td style="background:#111111;border:1px solid #2a2a2a;border-radius:16px;padding:40px 36px;">
      ${innerHtml}
    </td></tr>

    <tr><td bgcolor="#0d0d0d" style="padding-top:24px;text-align:center;background-color:#0d0d0d;">
      <p style="margin:0;font-size:11px;color:#444444;line-height:1.6;">
        Hai ricevuto questa email perché sei iscritto a Mnesti.<br>
        Per disiscriverti rispondi a questa email con oggetto "Unsubscribe".
      </p>
    </td></tr>

  </table>
  </td></tr></table>
</div>
</body></html>`
}

// ── Resend helper ─────────────────────────────────────────────────────────────
export async function sendViaResend(
  resendKey: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    from:    FROM_EMAIL,
    to:      [to],
    subject,
    html,
  }
  if (replyTo) body.reply_to = replyTo

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${resendKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  return res.json() as Promise<{ id: string }>
}
