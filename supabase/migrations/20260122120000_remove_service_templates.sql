-- Remove dependency rows before deleting legacy service templates.
DROP TABLE IF EXISTS public.service_template_dependencies;
DROP TABLE IF EXISTS public.service_templates;
