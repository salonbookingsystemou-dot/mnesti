/**
 * blog-publisher — Supabase Edge Function
 *
 * Server-to-server endpoint used by the GitHub Actions daily publisher.
 * Authenticates with PUBLISHER_SECRET (not user JWT), forwards
 * the generation request to Anthropic, and returns the raw text response.
 *
 * POST /functions/v1/blog-publisher
 * Authorization: Bearer <PUBLISHER_SECRET>
 * Body: { system: string, user: string }
 * Response: { content: string }
 */

import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  // ── Auth ──────────────────────────────────────────────────────────────────
  const publisherSecret = Deno.env.get('PUBLISHER_SECRET')
  if (!publisherSecret) return json({ error: 'PUBLISHER_SECRET not configured' }, 500)

  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${publisherSecret}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── Anthropic key ──────────────────────────────────────────────────────────
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { system?: string; user?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.system || !body.user) {
    return json({ error: 'Missing required fields: system, user' }, 400)
  }

  // ── Call Anthropic ─────────────────────────────────────────────────────────
  try {
    const client = new Anthropic({ apiKey })

    const msg = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: body.system,
      messages: [{ role: 'user', content: body.user }],
    })

    const content = (msg.content[0] as { type: string; text: string }).text
    return json({ content })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[blog-publisher] Anthropic error:', message)
    return json({ error: 'Anthropic API error', detail: message }, 502)
  }
})
