# EventVibe Backend

Express + MongoDB backend API for EventVibe.

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

| Variable       | Required | Notes                                                              |
| -------------- | -------- | -------------------------------------------------------------------|
| `MONGODB_URI`  | Yes      | MongoDB connection string.                                         |
| `PORT`         | No       | Only used for local/non-serverless hosting. Defaults to `5000`.    |
| `CLIENT_URL`   | No       | Comma-separated allowed CORS origins. Empty = allow all (dev only).|

## Local development

```bash
npm install
npm run dev
```

## Production build (Render / Railway / VPS / Docker)

```bash
npm install
npm run build   # compiles src/ -> dist/
npm start        # runs dist/app.js
```

Set `MONGODB_URI` (and optionally `PORT`, `CLIENT_URL`) as environment
variables on your hosting platform before starting the service.

## Deploying to Vercel

This repo includes a `vercel.json` that builds `src/app.ts` directly with
`@vercel/node`. Steps:

1. Import the repo in the Vercel dashboard (or `vercel` CLI).
2. In **Project Settings → Environment Variables**, add:
   - `MONGODB_URI`
   - `CLIENT_URL` (your frontend's deployed URL)
3. Deploy. Vercel sets `VERCEL=1` automatically at runtime, which this app
   uses to skip calling `app.listen()` (Vercel functions don't use a
   long-running listener — the exported `app` is invoked per-request).

## API

- `GET /` — health check
- `GET /api/events` — public, published events only
- `GET /api/event/:id` — public, single event
- `POST /api/event/post` — auth (client/admin)
- `PATCH /api/event/update/:id` — auth (creator or admin)
- `DELETE /api/event/delete/:id` — auth (creator or admin)
- `GET /api/admin/events` — auth (admin)
- `GET /api/users` — auth (admin)
- `PATCH /api/users/:id` — auth (admin)
- `DELETE /api/users/delete/:id` — auth (admin)

All authenticated routes expect `Authorization: Bearer <token>`.
