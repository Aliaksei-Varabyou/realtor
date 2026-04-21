# Realtor Booking MVP (Vercel Serverless)

Vite React app with Vercel serverless API routes for booking and Google Calendar integration.

- Frontend: React + TypeScript (Vite)
- Backend: Vercel API routes (`/api/*`)
- Google API: `googleapis` OAuth2 + Calendar FreeBusy/events
- Storage: Redis via `REDIS_URL` (`ioredis`)

## Project structure

- `src/` - frontend booking + admin UI
- `api/` - serverless API handlers
  - `availability.ts`
  - `book.ts`
  - `auth.ts`
  - `auth/callback.ts`
  - `admin-calendars.ts`
- `lib/` - shared serverless logic
  - `google.ts`
  - `availability.ts`
  - `calendarRules.ts`
  - `storage.ts`

## Environment

Copy `.env.example` to `.env` and fill:

- `ADMIN_PASSWORD`
- `APP_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

Optional:

- `REDIS_URL`

## Local development

Install:

```bash
npm install
```

Run Vercel API locally:

```bash
npm run dev:vercel
```

Run frontend in another terminal:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API (via Vercel dev): `http://localhost:3000/api/*`

Vite proxies `/api` requests to port `3000`.

## API endpoints

- `GET /api/availability?meetingType&city&date`
- `POST /api/book`
- `GET /api/auth?role=calendar1|calendar2|calendar3` (admin password in `x-admin-password` or `adminPassword` query for browser redirect)
- `GET /api/auth/callback`
- `GET /api/admin-calendars` (admin password in `x-admin-password`)

## Multi-account Google setup

- Admin page shows status for `calendar1`, `calendar2`, `calendar3`
- Each role is connected through its own OAuth flow
- Callback stores `role + email + refreshToken + primary calendarId`
- Availability and booking use connected roles based on business rules
- If Google returns `401`, role is marked disconnected automatically

## Deployment to Vercel

1. Push repository to GitHub/GitLab/Bitbucket.
2. Import project in Vercel.
3. Set build command: `npm run build`.
4. Set output directory: `dist`.
5. Add all env vars from `.env.example` in Vercel project settings.
6. Configure `REDIS_URL` in Vercel project env vars.
7. Update Google OAuth redirect URI to:
   - `https://YOUR_DOMAIN/api/auth/callback`
8. Deploy.
