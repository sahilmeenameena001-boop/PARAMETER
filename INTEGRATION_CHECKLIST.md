# Integration checklist

- [ ] Copy module files into the matching project paths.
- [ ] Install `@supabase/supabase-js`, `zod`, and `lucide-react`.
- [ ] Run the SQL migration once.
- [ ] Replace `requireUser()` with the dashboard's real server-session resolver.
- [ ] If an `organization_members` table already exists, remove its `create table if not exists` line and align policy column names.
- [ ] Add Supabase environment values.
- [ ] Run `seed_the_page_brand_audit()` and copy its returned client UUID.
- [ ] Open `/dashboard/brand-transformation/{clientUuid}`.
- [ ] Click **Create tasks** and verify records appear in `brand_transformation_tasks`.
- [ ] POST content to `/api/brand-transformation/clients/{clientUuid}/generate-prompt`.
- [ ] Import n8n workflows only if n8n enhancement is wanted.
- [ ] Set `OPENAI_API_KEY` and `OPENAI_MODEL` in n8n before activating the workflows.
- [ ] Add navigation link in the existing dashboard sidebar.
- [ ] Run `npm run build` before deployment.

## Prompt endpoint example

```bash
curl -X POST 'http://localhost:3000/api/brand-transformation/clients/CLIENT_UUID/generate-prompt' \
  -H 'content-type: application/json' \
  -H 'x-user-id: USER_UUID' \
  -H 'x-organization-id: ORGANIZATION_UUID' \
  -d '{"content":{"headline":"A stay worth remembering","standfirst":"Experience The Page beyond the room.","footer":"Reserve your experience"}}'
```

## Professional Authority Intelligence

- [ ] Review and apply `supabase/migrations/20261012_professional_intelligence.sql` (after the brand migration) on a non-production project first.
- [ ] Grant reviewer roles in `pi_member_roles` (`legal_reviewer` / `admin`).
- [ ] Verify seeded leads against the live sources before any content is approved.
- [ ] Run `npm test`, `npm run typecheck` and `npm run build`.
