# Bridges Outreach Platform

**Street Outreach Data Platform — Bridges Outreach, Inc.**

A mobile-first, offline-capable Progressive Web App (PWA) for street outreach workers serving people experiencing homelessness across Essex and Union County, New Jersey.

## Design Philosophy

> The encounter form is a conversation tool, not a compliance document.

This platform is built around seven core principles:

1. Lead with what the person wants, not what the system needs to know
2. Housing preferences and self-identified barriers are real constraints, not wish lists
3. Incomplete records on early encounters are expected — not failures
4. "What I've Already Tried" generates system intelligence, not client failure data
5. Outreach workers are the closest observers of system dysfunction — capture their intelligence
6. The person experiencing homelessness should be able to see, correct, and disagree with their own record
7. The encounter form is a conversation tool, not a compliance document

## Current Status: Phase 1 (MVP)

### What's Built
- **Client + Encounter + Worker** data model (IndexedDB)
- **Mobile encounter form** with tiered data collection (Tier 1/2/3)
- **Client search** across name, last name, and alias/street name
- **Encounter history** per client, grouped by date
- **Client profiles** with data completeness indicators
- **Dashboard** with encounter counts and recent activity
- **Full offline support** — works without connectivity, data persists in IndexedDB
- **GPS capture** on encounters
- **Progressive record building** — Tier 2 fields only show what's missing on follow-ups

### Roadmap
- **Phase 2**: Housing History, Preferences, Barriers, Income, Documents, Disability, Veteran, Legal, CE Status, Prior System Contact. Client profile tabs. Data completeness across all entities.
- **Phase 3**: Outreach Debrief, Client Flags, System Failure Reports, Warm Handoff, Supervisor dashboard.
- **Phase 4**: Stability Check-In (post-housing), Observation Log, My Path printable.
- **Phase 5**: HMIS export, BVH by-name list export, aggregate reporting, Landlord Partner module.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | React 18 | Component model, ecosystem, PWA support |
| Build | Vite 6 | Fast builds, HMR, PWA plugin |
| Offline Storage | IndexedDB | Structured client-side DB, large capacity, indexed queries |
| PWA | vite-plugin-pwa + Workbox | Service worker generation, offline caching, installability |
| Deployment | Static hosting (Vercel/Netlify/GitHub Pages) | No server needed for MVP |

### Why This Stack

The primary user is an outreach worker on a phone, standing on a sidewalk, possibly with no connectivity. This means:
- **PWA over native app**: No app store deployment, instant updates, works on iOS + Android
- **IndexedDB over localStorage**: Supports structured queries, indexes, and large datasets
- **Client-side UUIDs**: Records can be created fully offline
- **Static deployment**: No server to maintain, no downtime, CDN-edge delivery

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Install & Run

```bash
# Clone the repo
git clone https://github.com/YOUR_ORG/bridges-outreach-platform.git
cd bridges-outreach-platform

# Install dependencies
npm install

# Start dev server (accessible on local network for phone testing)
npm run dev
```

Open `http://localhost:5173` on your phone or desktop browser.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`. Deploy this folder to any static host.

### Deploy to Vercel (Recommended)

1. Push to GitHub
2. Connect repo to [vercel.com](https://vercel.com)
3. Vercel auto-detects Vite and deploys
4. Custom domain optional

### Deploy to GitHub Pages

```bash
# In vite.config.js, add: base: '/bridges-outreach-platform/'
npm run build
# Push dist/ to gh-pages branch
```

## Testing on a Phone

During development, `npm run dev` exposes the server on your local network. Find your machine's IP (e.g., `192.168.1.x`) and open `http://192.168.1.x:5173` on your phone.

On the phone:
- **iOS Safari**: Tap Share → "Add to Home Screen"
- **Android Chrome**: Tap menu → "Install app" or "Add to Home Screen"

This installs it as a standalone app with offline capability.

## Project Structure

```
bridges-outreach-platform/
├── index.html              # Entry point
├── package.json
├── vite.config.js          # Vite + PWA configuration
├── public/
│   └── favicon.svg         # Bridges "B" favicon
└── src/
    ├── main.jsx            # React mount
    └── App.jsx             # Full application (Phase 1 MVP)
```

## Data Model (Phase 1)

### Client
Core person record. One per individual. Updated progressively across encounters.
- `id` (UUID), `first_name`, `last_name`, `alias_street_name`, `date_of_birth`, `gender`, `phone`, `email`, `ssn_last4`, `reliable_location`, `trusted_contact_name`, `trusted_contact_phone`, `race`, `ethnicity`, `hmis_client_id`, `created_at`, `updated_at`

### Encounter
Each contact between worker and client. Multiple per client.
- `id` (UUID), `client_id` (FK), `worker_id` (FK), `encounter_date`, `encounter_time`, `encounter_type`, `location_text`, `location_lat`, `location_lng`, `what_matters`, `focus_today` (multi), `sleeping_location`, `interest_housing`, `interest_shelter`, `services_of_interest` (multi), `notes`, `follow_up_actions`, `safety_concerns`, `created_at`

### Worker
Outreach staff. Used for encounter assignment and filtering.
- `id` (UUID), `name`, `role`, `active`, `created_at`

## Tiered Data Collection

| Tier | When | Fields |
|------|------|--------|
| **Tier 1** | Every encounter | Date, worker, location, type, first name, sleeping location, what matters, housing/shelter interest, reliable location |
| **Tier 2** | When possible | Last name, DOB, phone, trusted contact, housing history, income type, Medicaid, veteran status, CE status, documents |
| **Tier 3** | Build over time | SSN, email, demographics, MCO plan, disability detail, legal, full preferences, barriers, prior system contact |

The form never blocks submission for missing Tier 2 or Tier 3 fields.

## Branding

| Color | Hex | Usage |
|-------|-----|-------|
| Navy Blue | `#06487C` | Headers, navigation, primary actions |
| Red | `#DB2416` | "What Matters" sections, alerts, accents |
| Sky Blue | `#73B8D7` | Secondary accent, housing preferences, positive states |
| Navy Light | `#E8F0F6` | Table headers, background tints |
| Red Light | `#FDEAE8` | Barrier/alert backgrounds |
| Sky Light | `#E5F2F8` | Instruction boxes, preference backgrounds |

Font: Arial / system sans-serif. No logo in form headers.

## Security Notes

- SSN stored as last-4 only
- All data in IndexedDB (client-side only in MVP; server sync in future phases)
- No client data transmitted without explicit sync action
- Session-scoped — data clears on explicit logout (to be implemented)
- Future: RBAC, audit logging, encryption at rest, HIPAA compliance layer

## License

Proprietary — Bridges Outreach, Inc. All rights reserved.

## Contact

Michael Callahan, PhD, LCSW — Chief Operating Officer
Bridges Outreach, Inc. — Newark, NJ
