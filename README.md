# Dawnward

**Arrive ready, not wrecked.**

Dawnward is a free jet lag optimization app that generates personalized schedules for adapting to new timezones. It uses the same circadian science models found in clinical research—light exposure timing, melatonin, and caffeine strategy—to help you shift your body clock before and after travel.

**Live at [dawnward.app](https://dawnward.app)**

---

## How It Works

Your body has a master clock (the suprachiasmatic nucleus) that controls when you feel alert and when you feel sleepy. Jet lag happens when this internal clock is out of sync with your destination timezone.

Dawnward uses the Forger99 circadian model to calculate:

- **When to seek light** — Bright light at the right time shifts your clock forward or backward
- **When to avoid light** — Light at the wrong time can shift you the wrong direction
- **Melatonin timing** — Low-dose melatonin (0.5mg) taken at the right time accelerates adaptation
- **Caffeine strategy** — When coffee helps alertness vs. when it disrupts sleep

The app generates a day-by-day schedule starting several days before your flight, accounting for your normal sleep schedule, flight times, and how aggressive you want the shift to be.

---

## Features

- **Trip planning** — Enter your origin, destination, and flight times
- **Multi-leg trips** — Chain flights (SFO → NRT → SIN) with proper layover handling
- **Prep days** — Start shifting 1-7 days before departure
- **Schedule intensity** — Choose gentle, balanced, or aggressive adaptation
- **Mobile-first UI** — Check your schedule on your phone
- **No account required** — Generate schedules without signing up

---

## Tech Stack

| Layer           | Technology                         |
| --------------- | ---------------------------------- |
| Framework       | Next.js 16 (App Router)            |
| Styling         | Tailwind CSS v4, shadcn/ui         |
| Circadian Model | Python (Forger99 via Arcascope)    |
| Database        | PostgreSQL via Prisma              |
| Auth            | NextAuth.js v5 (Google)            |
| Hosting         | Vercel                             |

---

## Development

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js 20+)
- Python 3.9+
- PostgreSQL (optional, for auth features)

### Setup

```bash
# Install dependencies
bun install
pip install -r requirements.txt

# Run development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Project Structure

```
src/
├── app/              # Next.js pages and API routes
├── components/       # React components
│   └── ui/           # shadcn/ui components
├── lib/              # Utilities and helpers
└── types/            # TypeScript types

api/_python/
├── circadian/        # Schedule generation
│   ├── science/      # PRC, markers, sleep pressure
│   └── scheduling/   # Phase generator, intervention planner
└── tests/            # Python tests

design_docs/          # Specifications and design decisions
```

---

## The Science

Dawnward's approach is based on published circadian research:

- **Phase Response Curves** — Khalsa et al. (2003) for light, Burgess et al. (2010) for melatonin
- **Two-Process Model** — Borbély (1982) for sleep pressure
- **Shift limits** — Eastman & Burgess guidelines (~1-1.5h/day safe shifting)

The algorithm estimates your circadian phase (CBTmin) from your sleep schedule, then calculates optimal intervention windows using phase response curves. It respects physiological limits to avoid antidromic shifts (shifting the wrong direction).

For full details, see [`design_docs/science-methodology.md`](design_docs/science-methodology.md).

---

## Contributing

Contributions welcome. Before submitting a PR:

```bash
bun run lint
bun run typecheck
bun run test:run
bun run lint:python
bun run test:python
```

---

## Credits

- **Circadian modeling** — Based on the [Arcascope](https://www.arcascope.com/) circadian library
- **UI components** — [shadcn/ui](https://ui.shadcn.com/)
- **Icons** — [Lucide](https://lucide.dev/)

---

## Disclaimer

Dawnward is not medical advice. Consult a healthcare provider for sleep disorders or medical conditions. The schedules are recommendations based on circadian science models—individual results vary.
