# Email Centre Guide

Admin email dispatch uses the Platform `send-email` Edge Function. Provider credentials are read from `public.email_configurations` (view only in Admin).

## Features

- **Compose** — send templated emails to individual users
- **Campaigns** — broadcast to filtered audiences
- **Event triggers** — automatic emails after admin actions (tester approval, refunds, etc.)
- **Send log** — admin-specific audit trail in `admin.email_send_log`

## Migrations

```bash
pnpm run admin:migrate-email-dispatch
pnpm run admin:migrate-email-campaigns
pnpm run admin:migrate-email-triggers
pnpm run admin:seed-email-data
```
