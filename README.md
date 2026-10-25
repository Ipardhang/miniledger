# MiniLedger

A mobile-first lending tracker for recording money lent to friends, monitoring due dates, and closing out repayments.

## Features

- Phone-based authentication with development OTP mode or production SMS delivery
- Loan entries with friend, amount, due date, and optional receipt
- Outstanding, repaid, and overdue summaries
- One-tap repayment status updates
- Per-user data isolation and protected receipt access
- Rate limiting, validation, audit/security events, and automated API tests

## Tech stack

**Mobile:** React Native, Expo, TypeScript  
**Backend:** Node.js, Express, TypeScript  
**Database:** PostgreSQL  
**Auth:** JWT + OTP  
**Testing:** Jest, Supertest  
**Local infrastructure:** Docker Compose

## Project structure

```text
miniledger/
├── backend/              # API, database, auth, validation, uploads, tests
├── mobile/               # Expo React Native client
└── docker-compose.yml
```

## Run locally

### Backend

```bash
docker compose up -d
cd backend
cp .env.example .env
npm install
npm run dev
```

The API runs on `http://localhost:4000` by default.

### Mobile

```bash
cd mobile
npm install
npx expo install --fix
npx expo start
```

For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN address.

## Tests

```bash
cd backend
npm test
```

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/request-otp` | Request a login OTP |
| POST | `/auth/verify-otp` | Verify OTP and create a session |
| GET | `/loans` | List the current user's loans |
| POST | `/loans` | Create a loan |
| PATCH | `/loans/:id/repay` | Mark a loan as repaid |
| GET | `/loans/summary` | Read totals and outstanding amounts |
| GET | `/loans/:id/receipt` | Retrieve an owned receipt |
| GET | `/health` | Health check |

## Production

Production requires secure environment configuration. Set a random 32+ character `JWT_SECRET`, exact allowed origins, production SMS credentials, and object storage for receipts. Never commit secrets or `.env` files.

## Scope

MiniLedger focuses on simple all-or-nothing loan repayment. Editing, deleting, and partial repayments are not currently included.
