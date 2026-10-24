# MiniLedger

A small app to track money you've lent to friends.

- **Backend:** Node.js + TypeScript + Express + PostgreSQL
- **App:** React Native (Expo) + TypeScript

Features: phone login with development OTP mode or production SMS delivery, rotating sessions, add a loan entry
(friend name, amount, due date), mark it repaid, overdue highlighting, a summary card
(total lent / repaid / overdue), optional receipt photo per entry, input validation, and tests.

```
miniledger/
├── docker-compose.yml     # PostgreSQL for local dev
├── backend/               # Express + TypeScript API
│   ├── schema.sql         # tables (applied automatically on startup)
│   ├── src/               # app, auth, loans, validation, upload, db, errors
│   └── tests/             # unit + API integration tests (Jest, Supertest)
└── mobile/                # Expo React Native app
    ├── App.tsx
    └── src/{api.ts, format.ts, screens/, components/}
```

## Prerequisites

- Node.js 20+ and npm
- Docker (for PostgreSQL), or any local PostgreSQL 13+
- For the app: the **Expo Go** app on your phone, or an Android emulator / iOS simulator

## 1. Run the backend

```bash
# from the repo root: start PostgreSQL
docker compose up -d

cd backend
cp .env.example .env          # defaults match docker-compose.yml
npm install
npm run dev                   # http://localhost:4000
```

Tables are created automatically on startup. Without Docker, create a database and
set `DATABASE_URL` in `backend/.env`.

**The OTP is printed in the server terminal**, for example:

```
[MOCK OTP] +919876543210 -> 482913 (valid for 5 minutes)
```

For demos you can set `MOCK_OTP=123456` in `backend/.env` to make every OTP the same.

## 2. Run the mobile app

```bash
cd mobile
npm install
npx expo install --fix        # aligns native package versions with your Expo SDK
npx expo start
```

Scan the QR code with Expo Go (or press `a` / `i` for an emulator / simulator).

Where the app finds the API:

| Where the app runs | API URL used |
|---|---|
| iOS simulator | `http://localhost:4000` (default) |
| Android emulator | `http://10.0.2.2:4000` (default) |
| Physical phone | set `EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:4000` before `npx expo start` (phone and computer on the same Wi-Fi) |

Example: `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npx expo start`

If Expo Go says the project's SDK is outdated, run
`npx expo install expo@latest && npx expo install --fix`.

## 3. Run the tests

The API tests need PostgreSQL running (step 1). Each run uses its own throwaway phone
numbers and cleans up after itself.

```bash
cd backend
npm test
```

Set `TEST_DATABASE_URL` to point the tests at a different database.

## API

All `/loans` routes need `Authorization: Bearer <token>`. Errors look like
`{ "error": "message", "details": [{ "field", "message" }] }`.

| Method | Path | Description |
|---|---|---|
| POST | `/auth/request-otp` | Body `{ phone }`. Generates an OTP and prints it in the server log. |
| POST | `/auth/verify-otp` | Body `{ phone, otp }`. Returns `{ token, user }`; creates the user on first login. |
| GET | `/loans` | The user's entries: unrepaid first (soonest due first), then repaid. Each has `isOverdue`, `isRepaid`, `hasReceipt`. |
| POST | `/loans` | Add an entry. JSON `{ friendName, amount, dueDate }`, or `multipart/form-data` with the same fields plus an optional `receipt` image (JPEG/PNG/WebP, max 5 MB). |
| PATCH | `/loans/:id/repay` | Mark as repaid (`409` if already repaid). |
| GET | `/loans/summary` | `{ totalLent, totalRepaid, overdueAmount, overdueCount, outstanding }` |
| GET | `/loans/:id/receipt` | The receipt image (owner only). |
| GET | `/health` | Liveness check. |

Quick check with curl:

```bash
curl -X POST localhost:4000/auth/request-otp -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210"}'                       # read the OTP in the server log
curl -X POST localhost:4000/auth/verify-otp -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210","otp":"<OTP>"}'         # copy the token
curl -X POST localhost:4000/loans -H "Authorization: Bearer <TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{"friendName":"Asha","amount":500,"dueDate":"2026-12-01"}'
curl localhost:4000/loans/summary -H "Authorization: Bearer <TOKEN>"
```

## Design notes and assumptions

- **Overdue** = not repaid and `due_date` is before today (database date). Past due dates are
  accepted so you can log older loans.
- **Summary:** *total lent* = all entries, *total repaid* = entries marked repaid,
  *overdue amount* = unrepaid entries past their due date. `outstanding` = lent − repaid.
  Repayment is all-or-nothing (no partial repayments).
- **Money** is stored as `NUMERIC(12,2)` with at most 2 decimals; dates are plain `YYYY-MM-DD`
  strings to avoid timezone shifts.
- **Auth:** OTPs are stored hashed, expire after 5 minutes, and lock after 5 wrong attempts.
  A JWT (30 days) is returned and kept on the device in secure storage. Every query is scoped
  to the logged-in user, and receipts are only served to their owner.
- **Phone numbers** are compared as typed after removing spaces/dashes, so `9876543210` and
  `+919876543210` are different accounts. Use one format consistently.
- **Receipts** are stored on local disk in `backend/uploads/` under random names. For production
  you'd use object storage (S3 etc.).
- **Still out of scope:** editing or deleting entries and partial repayments.
- Currency is set in `mobile/src/format.ts` (`CURRENCY`, `LOCALE`).


## Mobile UI refresh

The mobile app uses a refreshed, consistent visual style across the dashboard, sign-in, and new-entry screens: forest-green accents, soft neutral surfaces, stronger typography, clearer loan status states, and redesigned summary and form cards. Existing OTP, loan, repayment, and optional receipt flows are preserved.

To run the mobile app from its folder:

```bash
cd mobile
npm install
npm run dev
```

For the browser version, use `npm run web`.
\n## Production hardening\n\nProduction configuration intentionally fails fast unless the security-sensitive settings are present.\n\n- Set a random `JWT_SECRET` (32+ characters).\n- Set `APP_ORIGINS` to the exact browser origins you allow.\n- Configure Twilio with `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`.\n- Do not set `MOCK_OTP` in production.\n- On Vercel, set `RECEIPT_STORAGE=s3` and configure the S3-compatible object storage variables in `backend/.env.example`.\n- The API now rate-limits OTP requests, consumes OTPs atomically, rotates refresh tokens, and records security/audit events.\n- Receipt uploads are processed in memory, have a 5 MB limit, and verify the file signature before storage.\n\nFor the mobile production build, set:\n\n    EXPO_PUBLIC_API_URL=https://your-api.example.com\n\nProduction builds no longer fall back to a developer-machine LAN address.