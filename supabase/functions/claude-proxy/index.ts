// Mnesti — Claude API Proxy
// Verifies user JWT, enforces rate limiting, forwards to Anthropic.
// The ANTHROPIC_API_KEY is stored as a Supabase secret — never exposed to clients.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FREE_DAILY_CALLS = 150

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // ── 1. Authenticate ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Non autenticato', code: 'UNAUTHORIZED' }, 401)
    }

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnon) {
      console.error('[claude-proxy] SUPABASE_URL or SUPABASE_ANON_KEY not set')
      return json({ error: 'Configurazione server incompleta (Supabase)', code: 'SERVER_ERROR' }, 500)
    }

    const sb = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authErr } = await sb.auth.getUser()
    if (authErr || !user) {
      return json({ error: 'Sessione scaduta — effettua il login', code: 'UNAUTHORIZED' }, 401)
    }

    // ── 2. Rate limiting (graceful: skip if tables missing) ───────
    let callsToday = 0
    let isPaid = false

    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: usageRow } = await sb
        .from('api_usage')
        .select('call_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle()

      callsToday = usageRow?.call_count ?? 0

      const { data: planRow } = await sb
        .from('user_plans')
        .select('plan_type, valid_until')
        .eq('user_id', user.id)
        .maybeSingle()

      isPaid = !!(planRow &&
        planRow.plan_type !== 'free' &&
        (!planRow.valid_until || new Date(planRow.valid_until) > new Date()))

      const dailyLimit = isPaid ? 500 : FREE_DAILY_CALLS
      if (callsToday >= dailyLimit) {
        return json({
          error: `Limite giornaliero raggiunto (${dailyLimit} chiamate). Riprova domani.`,
          code: 'RATE_LIMIT',
          calls_today: callsToday,
          limit: dailyLimit
        }, 429)
      }
    } catch (rateErr) {
      console.error('[claude-proxy] Rate limit check failed — denying request:', rateErr?.message)
      return json({
        error: 'Servizio temporaneamente non disponibile. Riprova tra qualche minuto.',
        code: 'SERVICE_UNAVAILABLE'
      }, 503)
    }

    // ── 3. Check API key ──────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      console.error('[claude-proxy] ANTHROPIC_API_KEY secret not set')
      return json({ error: 'Chiave API Anthropic non configurata sul server. Contatta l\'amministratore.', code: 'SERVER_ERROR' }, 500)
    }

    // ── 4. Parse & forward to Anthropic ──────────────────────────
    let rawPayload: unknown
    try {
      rawPayload = await req.json()
    } catch {
      return json({ error: 'Richiesta malformata (JSON non valido)', code: 'BAD_REQUEST' }, 400)
    }

    const p = rawPayload as Record<string, unknown>

    // Extract the stream flag explicitly — do NOT rely on it being present
    // in the forwarded payload, since that caused the bug where Anthropic
    // received stream:true and returned SSE but the proxy tried to JSON-parse it.
    const wantsStream = p.stream === true

    // Build the Anthropic payload: always set stream explicitly based on wantsStream
    // so there is a single source of truth between what we send and what we expect back.
    const anthropicPayload = { ...p, stream: wantsStream }

    const anthropicCall = () => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicPayload),
    })

    // Retry up to 3 times with exponential backoff on 529 Overloaded
    const RETRY_DELAYS = [2000, 5000, 10000]
    let anthropicRes = await anthropicCall()
    for (const delay of RETRY_DELAYS) {
      if (anthropicRes.status !== 529) break
      console.warn(`[claude-proxy] Anthropic 529 — retrying in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
      anthropicRes = await anthropicCall()
    }

    // ── 4b. Streaming passthrough ─────────────────────────────────
    // Dual-check: honour the client's stream flag AND the actual Anthropic
    // Content-Type — this guards against the stream flag being lost or
    // mismatched, which previously caused "Errore Anthropic (200) — risposta non valida".
    const anthropicIsStream = (anthropicRes.headers.get('content-type') ?? '').includes('text/event-stream')

    if (wantsStream || anthropicIsStream) {
      if (anthropicRes.status === 529) {
        return json({ error: 'Il servizio AI è sovraccarico. Riprova tra qualche minuto.', code: 'OVERLOADED' }, 503)
      }
      if (!anthropicRes.ok) {
        let errData: Record<string, unknown> = {}
        try { errData = await anthropicRes.json() } catch { /* ignore */ }
        console.error('[claude-proxy] Anthropic stream error:', anthropicRes.status, JSON.stringify(errData))
        return json({
          error: (errData as Record<string, { message?: string }>)?.error?.message ?? `Errore Anthropic (${anthropicRes.status})`,
          code: 'ANTHROPIC_ERROR',
        }, 502)
      }

      // Intercept usage events while passing all chunks through unchanged
      let inputTokens = 0, outputTokens = 0
      const today = new Date().toISOString().split('T')[0]
      const transform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk)
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const s = line.slice(6).trim()
            if (s === '[DONE]') continue
            try {
              const ev = JSON.parse(s)
              if (ev.type === 'message_start') inputTokens  = ev.message?.usage?.input_tokens  ?? 0
              if (ev.type === 'message_delta') outputTokens = ev.usage?.output_tokens ?? 0
            } catch { /* ignore malformed SSE lines */ }
          }
          controller.enqueue(chunk)
        },
        flush() {
          ;(async () => {
            const { error: rpcErr } = await sb.rpc('increment_api_usage', {
              p_user_id: user.id, p_date: today,
              p_calls: 1, p_input_tokens: inputTokens, p_output_tokens: outputTokens,
            })
            if (rpcErr) console.warn('[claude-proxy] usage log failed (stream):', rpcErr.message)
          })()
        },
      })

      anthropicRes.body!.pipeTo(transform.writable)
      return new Response(transform.readable, {
        headers: {
          ...CORS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    // ── 4c. Non-streaming: parse full JSON response ────────────────
    let data: Record<string, unknown>
    try {
      data = await anthropicRes.json()
    } catch {
      const ct = anthropicRes.headers.get('content-type') ?? 'unknown'
      console.error('[claude-proxy] Anthropic returned non-JSON response, status:', anthropicRes.status, 'content-type:', ct)
      return json({ error: `Errore Anthropic (${anthropicRes.status}) — risposta non valida (content-type: ${ct})`, code: 'ANTHROPIC_ERROR' }, 502)
    }

    // Log Anthropic-level errors for debugging
    if (!anthropicRes.ok) {
      console.error('[claude-proxy] Anthropic error:', anthropicRes.status, JSON.stringify(data))
    }

    // Still overloaded after all retries
    if (anthropicRes.status === 529) {
      return json({
        error: 'Il servizio AI è sovraccarico. Riprova tra qualche minuto.',
        code: 'OVERLOADED',
      }, 503)
    }

    // ── 5. Log usage (fire-and-forget) ────────────────────────────
    const today = new Date().toISOString().split('T')[0]
    const inputTokens  = (data as { usage?: { input_tokens?: number } }).usage?.input_tokens  ?? 0
    const outputTokens = (data as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0

    ;(async () => {
      const { error: rpcErr } = await sb.rpc('increment_api_usage', {
        p_user_id:       user.id,
        p_date:          today,
        p_calls:         1,
        p_input_tokens:  inputTokens,
        p_output_tokens: outputTokens,
      })
      if (rpcErr) console.warn('[claude-proxy] usage log failed:', rpcErr.message)
    })()

    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[claude-proxy] Unhandled error:', err)
    return json({ error: `Errore interno: ${(err as Error)?.message ?? 'sconosciuto'}`, code: 'SERVER_ERROR' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
