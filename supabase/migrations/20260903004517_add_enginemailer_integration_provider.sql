-- Keep delivery-event persistence aligned with the active transactional email provider.
alter type public.integration_provider add value if not exists 'enginemailer';
