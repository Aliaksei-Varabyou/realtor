# Realtor Booking MVP

Simple full-stack MVP for a real estate agency booking flow.

- Frontend: React + TypeScript (Vite)
- Backend: Node.js + Express (TypeScript)
- DB: SQLite via Prisma
- Calendar: Google Calendar API (FreeBusy + event creation)
- Admin auth: password-based login (JWT token)

## Project structure

- `src/` - frontend app (public booking form + admin panel)
- `backend/` - Express API + Prisma schema + Google integration

## Environment setup

### Frontend env

1. Copy `.env.example` to `.env`
2. Set API URL if needed:

```bash
VITE_API_URL="http://localhost:4000"
```

### Backend env

1. Copy `backend/.env.example` to `backend/.env`
2. Fill values:
   - `ADMIN_PASSWORD`
   - `ADMIN_JWT_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (must match Google OAuth app settings)

## Run locally

Install dependencies:

```bash
npm install
cd backend && npm install
```

Initialize Prisma/SQLite:

```bash
cd backend
npx prisma generate
npx prisma db push
```

Start backend:

```bash
cd backend
npm run dev
```

Start frontend (in another terminal):

```bash
npm run dev
```

Frontend: [http://localhost:5173](http://localhost:5173)  
Backend: [http://localhost:4000](http://localhost:4000)

## Main flows

### Public booking form

- Requires `meetingType` + `city` before time selection
- Loads available 30-minute slots from backend
- Requires at least one contact after slot selection:
  - Telegram username OR Instagram URL
- Re-checks slot before booking creation
- Creates event in all selected calendars and stores booking in DB

### Calendar selection rules

- consultation OR city=other -> `calendar1`
- mortgage + wroclaw -> `calendar1` + `calendar2`
- mortgage + warsaw -> `calendar1` + `calendar3`

### Availability rules

- FreeBusy data from selected calendars
- Merged busy intervals
- 30 min slots
- Working hours 09:00-18:00 (Europe/Warsaw)
- Excludes past times
- Applies 15-minute buffer around meetings

### Admin panel

- Login with password (`/admin`)
- Connect Google account (OAuth2)
- Assign `calendar1`, `calendar2`, `calendar3`
- View upcoming bookings from SQLite
