# Register Custom Field Limits (Admin v216 / monorepo v1311)

**Where:** System › Register Custom Field Limits (`/system/register-custom-fields`)
**Who:** `super_admin`, `system_admin` (permissions `system.register_custom_fields.view` / `.edit`)

Users in Platform and Simulator can add their own **custom fields** to any local register; each field is shared with their organisation only. This page controls how many custom fields an organisation may attach to **one** register.

- **Default limit** — applies to every organisation without an override. Initially 30; allowed range 1–200.
- **Organisation overrides** — give a specific organisation a higher or lower limit (e.g. a large bank that needs 60). Add with *Add override*, change with the edit icon, remove with the delete icon (the organisation then uses the default).

Every change asks for a reason and is written to the admin audit log (`register_custom_fields.default_limit`, `.override_set`, `.override_removed`).

Lowering a limit never deletes fields or values — organisations already above the new limit just cannot add more until they are below it.

**Technical:** writes go only through the SECURITY DEFINER RPCs in `SQL/v242_local_register_custom_field_limit_admin_rpc.sql` into `public.local_register_custom_field_settings` / `public.local_register_custom_field_limit_overrides` (monorepo `SQL/v1311`, which must run first). This is a documented narrow cross-schema exception in both `CLAUDE.md` files. User-facing guide: `E:\project-nidus\Documentation\Local_Register_Custom_Fields_v1311_Guide.md`.
