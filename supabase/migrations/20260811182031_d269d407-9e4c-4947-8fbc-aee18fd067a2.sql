-- Restores the service taxonomy tables before applying the current taxonomy contract.
CREATE TABLE IF NOT EXISTS public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  booking_requirements text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.service_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  booking_requirements text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS booking_requirements text[] NOT NULL DEFAULT '{}';

INSERT INTO public.service_categories (name, slug, booking_requirements)
VALUES
  ('Tire Services', 'tire-services', ARRAY['tire_fitment']),
  ('Detailing', 'detailing', ARRAY['basic_vehicle','detailing_assessment'])
ON CONFLICT (slug) DO UPDATE SET booking_requirements = EXCLUDED.booking_requirements;
