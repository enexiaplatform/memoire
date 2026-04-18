# Memoire

> Your professional memory OS — portable across companies, intelligent, private, always owned by you.

Memoire helps B2B professionals (Sales Managers, Account Executives, Business Development Managers) capture, structure, and retrieve career knowledge: customer context, deal intelligence, and relationship history.

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend/DB:** Supabase (Postgres + Auth + RLS + Storage)
- **AI:** Anthropic Claude API
- **Payments:** Stripe (subscription billing)
- **Hosting:** Vercel
- **State:** Zustand
- **Routing:** React Router v6

## Local Setup

### Prerequisites

- Node.js 18+
- npm 9+
- A [Supabase](https://supabase.com) project
- A [Stripe](https://stripe.com) account (for billing features)
- An [Anthropic](https://console.anthropic.com) API key (for AI features)

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/memoire-app.git
cd memoire-app
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (found in Project Settings > API) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key (server-side only) |
| `STRIPE_SECRET_KEY` | Stripe secret key (starts with `sk_test_`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (starts with `whsec_`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (starts with `pk_test_`) |
| `ANTHROPIC_API_KEY` | Anthropic API key (starts with `sk-ant-`) |
| `VITE_APP_URL` | Local dev URL, default `http://localhost:5173` |

### 3. Supabase Migration

Run the initial schema migration against your Supabase project:

1. Go to your Supabase Dashboard → **SQL Editor**
2. Open and paste the contents of `supabase/migrations/001_initial.sql`
3. Click **Run** to create all tables, indexes, RLS policies, and triggers

Alternatively, if you have the Supabase CLI installed:

```bash
supabase db push
```

### 4. Run Locally

```bash
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173).

## Project Structure

```
memoire-app/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # Button, Input, Card, Modal
│   │   └── layout/          # AppShell, Sidebar, TopNav, ProtectedRoute
│   ├── features/            # Feature modules
│   │   ├── auth/            # Landing, Login, Signup, VerifyEmail
│   │   ├── capture/         # Quick-entry capture interface
│   │   ├── entities/        # Entity views
│   │   ├── search/          # Search interface
│   │   └── settings/        # User settings, export, billing
│   ├── hooks/               # useAuth, useEntities
│   ├── lib/                 # Supabase, Stripe, Claude clients
│   ├── types/               # TypeScript types
│   └── utils/               # Utility functions
├── supabase/migrations/     # Database migrations
├── api/                     # Vercel serverless functions
├── .env.example             # Environment variable template
├── vercel.json              # Vercel deployment config
└── tailwind.config.js       # Tailwind CSS config
```

## Deployment

This project is configured for Vercel:

1. Push to GitHub
2. Connect the repo to Vercel
3. Add environment variables in Vercel project settings
4. Deploy — Vercel will auto-build from `main` branch

## Security

- All user data tables are protected by Supabase Row-Level Security (RLS)
- Every query is scoped to `auth.uid() = user_id`
- API keys for Stripe and Anthropic are server-side only (via Vercel serverless functions)
- Users own their data — full export available anytime

## License

Private — All rights reserved.
