# ExpeditorOS — The Operating System for Building Expeditors

**By Building Expediting Systems, Inc.**

## Quick Start (Replit)

1. **Create a new Replit** → Choose "React (Vite)" template
2. **Upload these files** → Replace the default files with this project
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Set environment variables** in Replit Secrets:
   - `VITE_SUPABASE_URL` → Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → Your Supabase anon key
5. **Run the Supabase schema:**
   - Go to Supabase → SQL Editor → paste `supabase-schema.sql` → Run
6. **Start dev server:**
   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub
2. Connect repo to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## Project Structure

```
expeditor-os/
├── src/
│   ├── main.jsx          ← Entry point
│   ├── App.jsx           ← Platform shell + routing
│   ├── lib/
│   │   └── supabase.js   ← Storage layer (Supabase + localStorage)
│   └── widgets/
│       ├── OathEcbCRM.jsx     ← OATH/ECB Court CRM
│       └── PropertyResearch.jsx ← Property Research & Compliance
├── public/
│   └── gn4-template.pdf  ← Official OATH GN4 form
└── supabase-schema.sql   ← Database schema (v1.1)
```

## Widgets

### ⚖ OATH/ECB Court CRM
Full case management for OATH/ECB court violations including PDF OCR parsing, GN4 form filling, invoice generation, calendar sync, email builder, AI defense suggestions, and hearing list generation.

### 🔍 Property Research (NEW)
NYC property research and compliance analysis CRM with:
- **PLUTO Lookup** — Auto-populate zoning, building class, lot area, FAR, owner, year built, and 15+ fields from NYC PLUTO data
- **DOB Violations** — Pull active DOB violations for any property
- **HPD Violations** — Pull HPD housing violations
- **ECB Violations** — Pull ECB/OATH violations
- **DOB Complaints** — Pull open DOB complaints
- **DOB Permits/Filings** — Pull active permit filings
- **Quick Links** — One-click access to BIS, DOB NOW, ZoLa, HPD Online, ACRIS, CityPay
- **Compliance Notes** — Freeform zoning analysis and code compliance findings
- **Printable Report** — Generate formatted property compliance report
- **Client Tracking** — Associate properties with clients and engagement types
- **Status Tracking** — Active, Researching, Compliant, Non-Compliant, Pending Filing, Filed, Archived
- **Analytics Dashboard** — Borough breakdown, violation counts, status distribution

All data sourced from NYC Open Data (SODA API) — no API key required.

## Adding New Widgets

1. Create `src/widgets/YourWidget.jsx`
2. Add route in `src/App.jsx` → WIDGETS array + Routes
3. Add table in `supabase-schema.sql`
4. Use `createStorage('your_table')` from `lib/supabase.js`

## What Saves

**Everything** persists when you hit Save:
- All property/violation fields
- PLUTO data snapshots
- Agency violation/complaint/permit snapshots
- Client info, compliance notes, research summaries
- Audit trail

## Tech Stack

- React 18 + Vite
- Supabase (PostgreSQL)
- NYC Open Data SODA API (PLUTO, DOB, HPD, ECB)
- pdf-lib (GN4 form filling)
- pdfjs-dist + Tesseract.js (violation PDF OCR)
- Vercel (hosting)
