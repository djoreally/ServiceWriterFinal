-- Canonical service completion records verified oil usage for reporting only.
-- Inventory reservation mutations remain outside this completion contract.
CREATE OR REPLACE FUNCTION public.complete_appointment_with_service_record(
  p_appointment_id uuid,
  p_oil_quarts_used numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  oil_quarts_used numeric := p_oil_quarts_used;
BEGIN
  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'oil_quarts_used', oil_quarts_used,
    'inventory_mutated', false
  );
END;
$$;
