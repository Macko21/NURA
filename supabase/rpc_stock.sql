-- NURA: RPC para descontar stock de forma atómica
-- Ejecutar en Supabase SQL Editor antes de usar la app

CREATE OR REPLACE FUNCTION nura_descontar_stock(
  p_producto_id UUID,
  p_cantidad NUMERIC,
  p_es_acc BOOLEAN
) RETURNS VOID AS $$
BEGIN
  IF p_es_acc THEN
    UPDATE nura_productos
    SET datos = jsonb_set(
      datos,
      '{stockUnidades}',
      to_jsonb(COALESCE((datos->>'stockUnidades')::numeric, 0) - p_cantidad)
    )
    WHERE id = p_producto_id
      AND COALESCE((datos->>'stockUnidades')::numeric, 0) >= p_cantidad;
  ELSE
    UPDATE nura_productos
    SET datos = jsonb_set(
      datos,
      '{stockLitros}',
      to_jsonb(COALESCE((datos->>'stockLitros')::numeric, 0) - p_cantidad)
    )
    WHERE id = p_producto_id
      AND COALESCE((datos->>'stockLitros')::numeric, 0) >= p_cantidad;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC para restaurar stock (al eliminar venta)
CREATE OR REPLACE FUNCTION nura_restaurar_stock(
  p_producto_id UUID,
  p_cantidad NUMERIC,
  p_es_acc BOOLEAN
) RETURNS VOID AS $$
BEGIN
  IF p_es_acc THEN
    UPDATE nura_productos
    SET datos = jsonb_set(
      datos,
      '{stockUnidades}',
      to_jsonb(COALESCE((datos->>'stockUnidades')::numeric, 0) + p_cantidad)
    )
    WHERE id = p_producto_id;
  ELSE
    UPDATE nura_productos
    SET datos = jsonb_set(
      datos,
      '{stockLitros}',
      to_jsonb(COALESCE((datos->>'stockLitros')::numeric, 0) + p_cantidad)
    )
    WHERE id = p_producto_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
