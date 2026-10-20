# Professional Authority Intelligence

Evidence-backed professional profiles, litigation records, publications and a content workflow with a mandatory human-review gate. Built as a sibling of the brand-transformation module, using the same stack (Next.js App Router, TypeScript, Tailwind, Supabase, zod, lucide-react) and the same conventions: a local demo workspace plus Supabase-backed API routes.

## Routes

| Route | Purpose |
|---|---|
| `/dashboard/professional-intelligence` | Full workspace (8 sections). Data is stored in this browser's localStorage; no Supabase or AI calls. Export/Import JSON for backups. |
| `/dashboard/professional-intelligence/[professionalId]` | Live read view backed by Supabase (needs `.env.local` + migration). |
| `GET /api/professional-intelligence/professionals/[id]` | Profile, claims (restricted contacts redacted server-side for non-reviewers), cases, orders, content, performance, derived litigation summary. |
| `POST /api/professional-intelligence/content/[id]/transition` | `{ to, note?, scheduledAt?, publishedUrl? }`. Runs the approval gate. |
| `POST /api/professional-intelligence/orders/[id]/outcome-review` | Outcome classification (reviewer only, order text required, verbatim excerpt). |
| `POST /api/professional-intelligence/professionals/[id]/performance` | `{ csv }` metric import with per-row validation. |

API auth uses the existing `requireUser()` from `lib/brand-transformation/auth.ts` (replace it with the real session helper before production, as for the brand module). Roles come from `pi_member_roles`.

## Files

```
types/professional-intelligence.ts            domain types
lib/professional-intelligence/
  constants.ts   tiers, categories, outcomes, statuses, score weights, disclaimer
  access.ts      roles (viewer < editor < legal_reviewer < admin), contact redaction
  evidence.ts    claim/source provenance, conflict handling, verification, completeness, warnings
  litigation.ts  category normalisation, dedup, outcome rules, elapsed duration, derived summary
  content.ts     status machine, approval gate, compliance flags, revisions, brief + export
  scoring.ts     opportunity score (25/25/20/15/10/5)
  performance.ts CSV parser/import, aggregation
  seed.ts        Amish Tandon example workspace (research leads only)
  server.ts      API helpers + row mappers
components/professional-intelligence/          workspace UI (one file per section)
supabase/migrations/20261012_professional_intelligence.sql
test/professional-intelligence/domain.test.ts
```

## Rules enforced (UI, API and database)

* **Provenance.** Every profile fact is a claim linked to source records. A claim can be verified only by a legal reviewer/admin and only with at least one *verified, current* source. Confidence (low/medium/high) is the reviewer's own score, settable on any claim from the claim card; the tier only suggests a level (A/B → high, C → medium, D → low). Bar enrolment and appointments require a Tier A source.
* **No silent overwrites.** A conflicting value is stored next to the existing one as *disputed*. Replacing a verified value requires an explicit reviewer supersede at equal or higher confidence. In the database, verified claim values are immutable.
* **Staleness.** Verified sources not re-accessed for 180 days are displayed as stale and stop counting as verified for approval.
* **Court outcomes.** `disposed` is a status, never an outcome. An outcome exists only after a reviewer classifies a final order **with extracted/entered text**, quoting a verbatim operative excerpt and a rationale. Procedural results (withdrawn, infructuous, …) cannot be labelled merits. No win rate is computed anywhere.
* **Counts are derived.** All totals come from stored records. Exact duplicates (same normalised CNR, or same case number + court) are counted once; same-party/different-CNR records are flagged "possibly related" and not merged. Interim applications are counted separately from underlying matters.
* **Represented side / appearances** are stored only when a source states them and stay unverified until a reviewer confirms. Attendance is never inferred. Elapsed duration is labelled as case duration, not advocate speed.
* **Content gate.** `idea → research_needed → draft → legal_review → approved → scheduled → published` (+ `rejected`). Legal review needs a body, linked evidence and the disclaimer. Approval needs a legal reviewer who is **not the author**, all linked sources/claims verified, no unreviewed disposed cases described, and no compliance flags (guarantees, win/success rates, superlatives, solicitation, client testimonials, individualised advice). Editing approved/scheduled content sends it back to draft. Published content is locked. Export/copy is available only after approval.
* **Contacts** start restricted (reviewers/admins only); public visibility requires a verified claim.
* **Performance** is manual/CSV only (no analytics integration exists in this project). Blank metrics stay unknown, never 0. Enquiries/consultations require attribution evidence.

## Automatic discovery (Firecrawl)

**Professional DNA → Auto-discover** searches the web for the selected person and fills a *candidates inbox*. Nothing is added to the profile until you click **Accept**, and accepted items are still unverified.

Setup: put `FIRECRAWL_API_KEY=fc-…` in `.env.local` (project root) and restart the server (`npm run build && npm start`). The key is used only on the server (`/api/professional-intelligence/discover`) and never sent to the browser. `GET /api/professional-intelligence/discover` reports whether it is configured.

What one run does:
* Builds focused queries from the name, aliases, profession, location and your extra context: general, firm, eCourtsIndia, official gov.in/nic.in sites, books/ISBN, Indian Kanoon, education/enrolment, speaking, news (Quick 3 / Standard 6 / Deep 10 queries, 5 results each; roughly 2–7 credits per query).
* Reads result pages through Firecrawl, but discards page text when robots.txt disallows it, and keeps only the public search snippet for LinkedIn/Facebook/Instagram.
* Scores each page 0–100 for "same person" (full name, title, profession, location, context terms, repetitions) and shows the reasons. Same-name collisions are common — the score is a hint, not proof.
* Extracts suggested facts only from sentences that mention the person: profession, practice areas, firm affiliation, roles/appointments, education, bar enrolment pattern, ISBN publications, speaking, location — each with the sentence it came from.
* Finds CNRs; on eCourtsIndia-style listings also the title, court, case type, status and the "Petitioner/Respondent Adv:" line. The represented side is recorded only if that line names this person, and stays unverified. Hearing attendance is never inferred.
* Never captures phone numbers or emails (they are stripped before anything is stored).
* Skips URLs that are already sources or candidates, so re-running finds only new pages.

Accepting a candidate creates an **unreviewed** source (with the discovery query, match score and reasons in its notes), the selected **unverified** claims linked to it, and the selected court records (existing CNRs are not duplicated). Rejected candidates are kept as "rejected" so they are not proposed again.

## Clip to SCL (Chrome extension)

Folder: `browser-extension/clip-to-scl` (see its README). Install via `chrome://extensions` → Developer mode → **Load unpacked**. Highlight text on any page (including pages SCL must not fetch, like LinkedIn) → right-click **Clip selection to SCL** or use the toolbar popup. The app opens with the clip; choose the professional, edit the excerpt and **Save as source**. The clip is carried in the URL fragment (never sent to a server); emails/phones are removed by default. If the URL is already a source, the clip is appended and the source goes back to review.

## Advocate summary (profile card + API)

**Summary** tab: photo, name, profession, location, enrolment, a narrative built from the facts, office address, email, phone, profile links, firm/affiliations, roles, education, practice areas, publications and court-record statistics. Every item shows its status (verified/unverified/inferred) and source. Toggle *Include unverified leads*; **Copy text**, **JSON**, **Print / PDF**.

* Photo: add a claim with field **Photo** (image URL), or accept a photo suggested by Auto-discover (an image on a page about the person whose caption/filename matches, or the page preview image). Loaded with `referrerPolicy="no-referrer"`; falls back to initials.
* Contacts (email, phone) and **Office address** are *restricted* by default: only legal reviewers/admins see them. A reviewer can set a **verified** contact to *internal* or *public* with the visibility selector on the claim. Editors/viewers see "N restricted contact item(s) hidden".
* Auto-discover now proposes emails, phones and office addresses found in text about the person, as restricted, unverified claims (masked for editors in the inbox). They are still stripped from stored page text and excerpts.

API:
* `POST /api/professional-intelligence/summary` with `{ "professionalId": "…", "includeUnverified": false, "workspace": <Export JSON> }` → summary JSON. On localhost the role comes from the workspace's current member; from other hosts the caller must be authenticated and only public contacts are returned.
* `GET /api/professional-intelligence/professionals/<id>/summary?includeUnverified=1` → same summary from Supabase, contacts filtered by the caller's `pi_member_roles` role.

## Settings → Integrations

Header **Settings** (or **Add Firecrawl key** in the Auto-discover box): paste the Firecrawl key once. It is written to `.env.local` on this computer and applied immediately (no restart); only the last 4 characters are ever shown. The endpoint (`/api/professional-intelligence/settings`) accepts only same-origin requests to a localhost server.

## Database setup

1. Review `supabase/migrations/20261012_professional_intelligence.sql`. It is additive (`pi_` prefix), creates no changes to existing tables, and depends on `organization_members` and `set_updated_at()` from the brand migration.
2. Apply it through your normal migration workflow (Supabase CLI or SQL editor) on a non-production project first.
3. Grant roles: `insert into pi_member_roles(organization_id, user_id, role) values (…, …, 'legal_reviewer');`
4. Entity mapping to the suggested model: `professionals → pi_professionals`, `source_evidence → pi_source_evidence`, `claims/claim_evidence → pi_claims/pi_claim_evidence`, aliases/affiliations/contacts/practice_expertise are **views** over `pi_claims`, `court_cases/court_case_parties/court_orders/case_outcome_reviews → pi_*`, `publications → pi_publications`, `content_* → pi_content_*` (`content_schedule` is `scheduled_at` on `pi_content_ideas`), plus `pi_audit_log`.

The migration was validated by applying it (after the brand migration) to an in-memory Postgres (PGlite) and exercising 28 gate checks (claim verification, immutability, outcome review, CNR uniqueness, content transitions, four-eyes approval, attribution). It has **not** been applied to any Supabase project.

## Researching any professional (the normal workflow)

The Amish Tandon profile is only an optional example. A fresh browser starts with an empty workspace.

1. **New research** (sidebar) → enter name, profession, location, other spellings and any links you already have (one per line). The wizard previews the suggested tier per link. It creates the profile, registers each link as an *unreviewed* source (login-walled sites such as LinkedIn as *inaccessible*), and adds unverified name/profession/location/alias/profile-link claims plus five editable default pillars.
2. **Professional DNA → Research links**: one-click public searches (Google, LinkedIn via Google, eCourtsIndia, Indian Kanoon, official gov.in/nic.in sites, books, news) for the selected person. You open them yourself; nothing is scraped.
3. **Evidence Registry → Add source → Fetch details**: fetches the page title, description, publish date and text into the form (server-side, robots.txt respected, login walls/private addresses refused, 2 MB/15 s caps, no redirects followed). PDFs are detected but not extracted. Fetched text is not verification — review and quote the excerpt.
4. Add claims (practice areas, affiliations, education, enrolment…) linked to sources; a reviewer verifies sources, then claims.
5. **Litigation → Import CSV** (template provided) or Add case; open a case to add orders and classify outcomes.
6. **Content Strategy → Starter ideas** creates research-needed ideas from the person's practice-area claims and publications.

Everything is editable: professional details, claims (verified values are locked — add a new claim and supersede), sources (editing URL/excerpt/type of a verified source resets it to unreviewed), cases, orders (changing order text clears the outcome classification), publications, pillars and ideas. Deletes ask for confirmation; deleting a professional requires typing their name and removes all their records (sources used only by them too). **Reset** offers *Clear everything* or *Reset to example*. Switch people with the selector in the header.

`PI_SOURCE_FETCH=off` disables Fetch details. The fetch route is open only to requests addressed to a localhost server; any other host requires an authenticated user.

Database: insert into `pi_professionals`, then `pi_source_evidence`, `pi_claims` + `pi_claim_evidence`, etc. Insert claims as `unverified` and verify via update after evidence is linked (the trigger rejects inserting already-verified claims).

## Source verification workflow

1. Open the source yourself. Do not bypass logins, CAPTCHAs, paywalls or robots rules; for inaccessible sources mark them *inaccessible* and enter evidence manually.
2. Confirm the page/PDF is authentic (official domain reached via the institution's own navigation) and current.
3. Tick the personal-check confirmation; recording the verification method is optional; verify.
4. Verify the claims that rely on it and score their confidence.

## Example profile — state on 2026-10-12

Seeded leads (all **unverified**; excerpts captured by an automated fetch and to be re-checked):

* Delhi High Court nominated-counsel PDF (Tier A, unreviewed): row 273 "AMISH TANDON … D/1106/2009". Only the first part of the 372-page PDF was processed; page and panel heading not confirmed; contact columns exist but were not copied. It does **not** establish the Senior Panel Counsel/DoLA designation.
* Niyogi Books page (Tier B): title, author, ISBN 978-93-85285-83-7, case-law coverage to June 2017. Edition and publication date not shown.
* eCourtsIndia profile (Tier D): aggregator shows 141 disposed / 95 pending entries, including interlocutory applications — **not** used as totals. Ten page-1 matters were imported without dates.
* LinkedIn (Tier C): inaccessible (login wall) — manual review needed.
* Innovatus Law affiliation and the Senior Panel Counsel role: no source attached.

## Tests

```bash
npm test          # 43 tests (domain rules, research workflow, CSV import, deletes, robots/extraction) (node --test, TypeScript via Node type stripping; Node ≥ 22.6)
npm run typecheck
npm run build
```

## Known limitations

* The workspace page stores data per browser (localStorage, ~5 MB). The Supabase path currently has a read view and gated write endpoints, not a full editing UI.
* Demo role switching is local only; real roles come from `pi_member_roles` via the server.
* No automated court/eCourts scraping, OCR or order extraction is implemented; order text is entered manually.
* Compliance flags are keyword heuristics to assist, not replace, a qualified reviewer; Bar Council rules must be checked by the reviewer.
* Opportunity scores are planning heuristics, not predictions.
