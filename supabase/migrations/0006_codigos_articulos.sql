-- Los códigos existentes siguen siendo válidos. LIM comparte serie entre multiuso y limpiavidrios.
create unique index if not exists productos_codigo_normalizado_unique
  on public.productos ((upper(btrim(codigo))))
  where codigo is not null and btrim(codigo) <> '';

create table if not exists public.series_codigos_articulos (
  prefijo text primary key,
  ultimo numeric not null check (ultimo >= 0)
);

alter table public.series_codigos_articulos enable row level security;
revoke all on public.series_codigos_articulos from public, anon, authenticated;

insert into public.series_codigos_articulos (prefijo, ultimo)
select partes[1], max(partes[2]::numeric)
from public.productos p
cross join lateral regexp_match(upper(btrim(p.codigo)), '^([A-Z]+)([0-9]+)$') as partes
where partes[1] is not null
group by partes[1]
on conflict (prefijo) do update set ultimo = greatest(series_codigos_articulos.ultimo, excluded.ultimo);

create or replace function public.crear_producto_codigo_automatico(p_producto jsonb, p_presentaciones jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  articulo_id text := p_producto->>'id';
  prefijo_codigo text;
  numero numeric;
  codigo_asignado text;
begin
  if not public.es_admin() then
    raise insufficient_privilege using message = 'Solo un administrador puede crear artículos.';
  end if;
  if articulo_id is null or btrim(articulo_id) = '' then
    raise exception 'Falta el identificador del artículo.';
  end if;

  -- Serializa altas y reintentos. La reserva se revierte si falla el guardado del artículo.
  perform pg_advisory_xact_lock(10478, 6);

  select p.codigo into codigo_asignado from public.productos p where p.id = articulo_id;
  if found then
    return codigo_asignado;
  end if;

  prefijo_codigo := case coalesce(p_producto->>'categoria', '')
    when 'Accesorio' then 'ACC'
    when 'Desengrasante' then 'DES'
    when 'Desinfectante' then 'BAC'
    when 'Detergente' then 'DET'
    when 'Jabón líquido' then 'JB'
    when 'Lavandina' then 'LAV'
    when 'Limpiador multiuso' then 'LIM'
    when 'Limpiavidrios' then 'LIM'
    when 'Perfumina' then 'PER'
    when 'Quitamanchas' then 'QUI'
    when 'Suavizante' then 'SU'
    else case when p_producto->>'tipo' = 'accesorio' then 'ACC' else 'ART' end
  end;

  select coalesce(max(substring(upper(btrim(p.codigo)) from '[0-9]+$')::numeric), 0) + 1
    into numero
    from public.productos p
    where upper(btrim(p.codigo)) ~ ('^' || prefijo_codigo || '[0-9]+$');

  insert into public.series_codigos_articulos as serie (prefijo, ultimo)
  values (prefijo_codigo, numero)
  on conflict (prefijo) do update set ultimo = greatest(serie.ultimo + 1, excluded.ultimo)
  returning ultimo into numero;

  codigo_asignado := prefijo_codigo || lpad(numero::text, greatest(3, length(numero::text)), '0');
  perform public.guardar_producto(p_producto || jsonb_build_object('codigo', codigo_asignado), p_presentaciones);
  return codigo_asignado;
end;
$$;

revoke execute on function public.crear_producto_codigo_automatico(jsonb, jsonb) from public, anon;
grant execute on function public.crear_producto_codigo_automatico(jsonb, jsonb) to authenticated;
