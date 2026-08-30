# LicenseVault (LtLM) — web & extensions edition

Secondary surface in the PERPETUA tree. The **launch** desktop product is
**Perpetua** under `../LtLMA/`.

## What's here

| Component | Path |
|-----------|------|
| Express API | `backend/` |
| React SPA | `frontend/` |
| Browser extension (MV3) | `frontend/browser-extension/` |
| VS Code extension | `frontend/vscode-extension/` |
| Docs | `docs/` |
| Docker | `Dockerfile`, `docker-compose.yml` |

## Quick start

```bash
cd backend && npm install && npm start
# separate terminal
cd frontend && npm install && npm run dev
```

API defaults to `http://localhost:3001`. See `docs/Development-Setup.md` and
`docs/Index.md`.

## Encryption note

Field-level encryption in `backend/utils/encryption.js` uses **AES-256-CBC**
(not GCM). Docs that say only “AES-256” refer to this util.

## Relationship to Perpetua

Perpetua is the local-first desktop vault taken to market. LtLM is the
parallel web + capture stack (deal-site bridges, extensions). Launch quality
gates for Perpetua do **not** block on LtLM completeness.
