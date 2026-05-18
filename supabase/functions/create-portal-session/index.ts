// Mnesti — create-portal-session Edge Function
// Crea una sessione Stripe Customer Portal per gestire/annullare l'abbonamento.
// Richiede header Authorization: Bearer <supabase-jwt>
// Body: { return_url?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Resolve env vars inside handler (avoids boot-time crashes if vars are missing)
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const SUPABASE_URL      = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const APP_URL           = Deno.env.get('APP_URL') ?? 'https://mnesti.it';

    if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
    if (!SUPABASE_URL)      throw new Error('SUPABASE_URL not set');
    if (!SUPABASE_SERVICE)  throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

    // 1. Autenticazione utente
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    // 2. Recupera stripe_customer_id
    const { data: plan } = await sb
      .from('user_plans')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!plan?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'Nessun abbonamento Stripe trovato per questo account.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. return_url dal body
    const body = await req.json().catch(() => ({}));
    const return_url = body.return_url || APP_URL;

    // 4. Crea sessione Customer Portal
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   plan.stripe_customer_id,
      return_url,
    });

    return new Response(
      JSON.stringify({ url: portalSession.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[create-portal-session]', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
