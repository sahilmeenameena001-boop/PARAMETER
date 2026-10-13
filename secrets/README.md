# Encrypted team secrets

`env.enc` holds the project's API keys (e.g. `FIRECRAWL_API_KEY`) **encrypted** with a team password
(AES-256-GCM, key derived with scrypt). It is safe to keep in the repository: without the password it is useless,
and a wrong password writes nothing.

## After cloning (teammates)

```bash
npm install
npm run unlock      # asks for the team password, creates .env.local
npm run build && npm start
```

## Updating a key (maintainers)

1. Put the new value in `.env.local` (or paste it via **Settings** in the app).
2. `npm run secrets:lock` — choose/repeat the team password.
3. Commit `secrets/env.enc`.

## Rules

* Share the **password** privately (in person, phone, password manager) — never in the repo, issues, commits or chat logs.
* `.env.local` (the decrypted file) stays git-ignored. Never commit it.
* If the password or a key leaks: rotate the key at the provider, run `npm run secrets:lock` with a **new** password, commit.
* Non-interactive use (CI): set `SCL_SECRETS_PASSWORD` in that environment's secret store.
