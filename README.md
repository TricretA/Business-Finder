# AI Business Hunter

A futuristic internal tool for automated business prospecting, website generation, and outreach powered by Gemini AI.

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ai-business-hunter
```

## Environment

Create a `.env` file in the project root when running locally. Copy `.env.example` and paste your keys.

Required (client-facing) env vars:

- `VITE_GOOGLE_MAPS_API_KEY` — Google Maps JavaScript API key (restrict to your domain in Google Cloud Console)
- `VITE_GOOGLE_API_KEY` — Google API key used by Google GenAI client (if you use server/client GenAI features)

Optional (services):

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — Supabase project config for persistence

Example `.env` creation:

```bash
cp .env.example .env
# then paste your keys into .env
```
