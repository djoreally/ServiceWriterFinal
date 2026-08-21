# Frontend foundation

This repository intentionally contains the preserved frontend only. The previous Supabase Edge Functions, SQL migrations, Lovable metadata, CI automation, provider integrations, and backend scripts have been removed.

The frontend is retained as the product reference and will be connected to the new Next.js/Express backend through a typed API boundary. Until that boundary is implemented, existing data-access imports remain placeholders and should be migrated domain by domain rather than reactivating the old backend.

The current Vite build is a temporary preservation shell. The next application step is to move the preserved UI into the planned Next.js application while keeping the visual language and interaction behavior intact.
