// Supabase Edge Function: auth-login
// Deploy: supabase functions deploy auth-login

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { username, password, rol } = await req.json()

    if (!username || !password || !rol) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: users, error } = await supabase
      .from('nura_usuarios')
      .select('id, datos')
      .eq('datos->>username', username)
      .eq('datos->>rol', rol)
      .eq('datos->>activo', 'true')
      .limit(1)

    if (error || !users || users.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Credenciales incorrectas' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user = users[0].datos
    const salt = user.salt || ''

    // Hash the provided password with the same SHA-256 logic
    const encoder = new TextEncoder()
    const data = encoder.encode(password + salt)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    if (hash !== user.passwordHash) {
      return new Response(
        JSON.stringify({ error: 'Credenciales incorrectas' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return safe user object (no password hash or salt)
    const safeUser = {
      id: users[0].id,
      nombre: user.nombre,
      username: user.username,
      rol: user.rol,
      activo: user.activo
    }

    return new Response(
      JSON.stringify({ user: safeUser }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
