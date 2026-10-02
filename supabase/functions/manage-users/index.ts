import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  try {
    // Verificar JWT del usuario que llama
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: { user: caller }, error: userError } = await supabase.auth.getUser(authHeader);
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verificar que el llamante es admin (via perfiles)
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', caller.id)
      .single();

    if (!perfil || perfil.rol !== 'admin') {
      return new Response(JSON.stringify({ error: 'Solo administradores' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      case 'create': {
        const { email, password, nombre, rol, activo = true } = payload;
        if (!email || !password || !nombre || !rol) {
          return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Crear usuario en Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nombre, username: email.split('@')[0] },
          app_metadata: { rol },
        });
        if (authError) throw authError;
        // Crear perfil
        const { error: perfilError } = await supabase.from('perfiles').insert({
          id: authData.user.id,
          username: email.split('@')[0],
          nombre: payload.nombre,
          rol: payload.rol,
          activo: payload.activo,
        });
        if (perfilError) {
          await supabase.auth.admin.deleteUser(authData.user.id);
          throw perfilError;
        }
        return new Response(JSON.stringify({ ok: true, user: authData.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'update': {
        const { id, nombre, rol, activo, password } = payload;
        if (!id) return new Response(JSON.stringify({ error: 'ID requerido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        // Actualizar Auth (password opcional)
        if (password) {
          const { error } = await supabase.auth.admin.updateUserById(id, { password });
          if (error) throw error;
        }
        // Actualizar perfil
        const { error } = await supabase.from('perfiles').update({ nombre: payload.nombre, rol: payload.rol, activo: payload.activo }).eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'delete': {
        const { id } = payload;
        if (!id) return new Response(JSON.stringify({ error: 'ID requerido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        // No permitir auto-eliminación
        const { data: { user } } = await supabase.auth.getUser(authHeader);
        if (user.id === id) {
          return new Response(JSON.stringify({ error: 'No podés eliminar tu propio usuario' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        await supabase.auth.admin.deleteUser(id);
        await supabase.from('perfiles').delete().eq('id', id);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('manage-users error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});