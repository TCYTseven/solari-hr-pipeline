# Solari Screener: Dashboard Design Plan

The dashboard should look like it came from the Solari team. Every token below was pulled from the CSS on getsolari.com (Framer site), so the page reads as an extension of their brand.

Use their colors, type, and layout patterns. Do not use the Solari logo as your own mark. Use a text wordmark ("Solari Screener") and a small "Built on Solari" line in the footer.

---

## 1. Design Tokens (from getsolari.com)

### Colors

| Token | Hex | Where Solari uses it | Use it for |
|---|---|---|---|
| `--bg` | `#080A0E` | Page background (most common bg token) | Page background |
| `--bg-raised` | `#0B0D10` | Section backgrounds | Header, sidebar |
| `--surface` | `#17171D` | Dark panels | Cards, table rows |
| `--surface-teal` | `#0F1514` | Teal-tinted dark panels | Code/log blocks |
| `--surface-teal-2` | `#151E1D` | Teal-tinted panels | Hover state on cards |
| `--line-teal` | `#2A3C3A` | Teal borders | Dividers inside logs |
| `--accent` | `#F5B301` | Amber: CTAs, highlight bars, "Solari" row in charts | Primary buttons, top score, active tab, "Solari" bars |
| `--accent-soft` | `#F5C66A` | Lighter amber | Hover on amber |
| `--blue` | `#0099FF` | Links and secondary highlights | Links, "running" status |
| `--text` | `#FFFFFF` | Headings | Headings, key numbers |
| `--text-body` | `#E7E7E2` | Warm off-white body/code text | Body text on dark |
| `--text-muted` | `#939599` | Secondary copy (2nd most used color) | Descriptions, meta, axis labels |
| `--text-faint` | `#636363` | Tertiary | Timestamps, disabled |
| `--border` | `rgba(255,255,255,0.10)` | Card outlines | Card and table borders |
| `--border-strong` | `rgba(255,255,255,0.16)` | Emphasized outlines | Hover borders, focused inputs |
| `--glass` | `rgba(8,10,14,0.82)` | Translucent nav bar | Sticky nav with backdrop blur |

**Amber divider line** (used across their sections):
```css
background: linear-gradient(90deg, rgba(245,179,1,0), rgba(245,179,1,0.96), rgba(245,179,1,0));
height: 1px;
```

**Code syntax colors** (from their code sample block), use for build logs:

| Role | Hex |
|---|---|
| Keywords | `#C792EA` |
| Functions / identifiers | `#82AAFF` |
| Strings | `#9BD89A` |
| Numbers / warnings | `#F5C66A` |
| Plain text | `#E7E7E2` |
| Comments | `#939599` |

**Status colors** (derived to sit inside their palette):

| Status | Color |
|---|---|
| Booted / passed | `#9BD89A` (their string green) |
| Running | `#0099FF` (their blue) |
| Build failed | `#FF6B5A` |
| Timeout / needs secrets | `#F5C66A` (their soft amber) |
| Opted out / skipped | `#636363` |

### Typography

| Role | Font | Weight | Size | Letter spacing | Notes |
|---|---|---|---|---|---|
| Display (hero) | Inter Display | 500 | 56px | -0.04em | Their hero is 56px |
| H2 section titles | Inter Display | 500 | 36-44px | -0.03em | |
| H3 card titles | Inter Display | 500 | 20-24px | -0.01em | |
| Body | Inter | 500 | 14-16px | -0.01em | Their default is Inter Medium 14px |
| Labels / eyebrows | JetBrains Mono | 600 | 12px | 0.04em | UPPERCASE, like "PRODUCTS", "EXPLORE BROWSERS", "ENV 01 ISOLATED" |
| Numbers / metrics | JetBrains Mono | 500 | 14-32px | 0 | Latencies, scores, counts |
| Code / logs | JetBrains Mono | 400 | 13px | 0 | |

Load from Google Fonts: `Inter`, `Inter Tight` (closest free stand-in for Inter Display if needed), `JetBrains Mono`.

Line height: 1.1 for display, 1.2 for H2/H3, 1.5 for body, 1.6 for logs.

### Radius, spacing, effects

- Radius: `10px` for cards and panels, `6px` for buttons and inputs, `4px` for badges, `50%` for avatars. Keep corners tight, their site avoids big pill shapes.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96px. Sections get 96px vertical padding on desktop, 64px on mobile.
- Max content width: 1200px, centered.
- Borders over shadows. Their dark sections rely on 1px translucent white borders, not drop shadows.
- Sticky nav: `--glass` background with `backdrop-filter: blur(12px)` and a bottom border of `--border`.

### CSS variables (drop-in)

```css
:root {
  --bg: #080A0E;
  --bg-raised: #0B0D10;
  --surface: #17171D;
  --surface-teal: #0F1514;
  --surface-teal-2: #151E1D;
  --line-teal: #2A3C3A;
  --accent: #F5B301;
  --accent-soft: #F5C66A;
  --blue: #0099FF;
  --text: #FFFFFF;
  --text-body: #E7E7E2;
  --text-muted: #939599;
  --text-faint: #636363;
  --border: rgba(255,255,255,0.10);
  --border-strong: rgba(255,255,255,0.16);
  --glass: rgba(8,10,14,0.82);

  --ok: #9BD89A;
  --run: #0099FF;
  --fail: #FF6B5A;
  --warn: #F5C66A;
  --skip: #636363;

  --font-display: "Inter Display", "Inter Tight", Inter, system-ui, sans-serif;
  --font-body: Inter, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --r-card: 10px;
  --r-btn: 6px;
  --r-badge: 4px;
}
```

### Tailwind config (if using Tailwind)

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: "#080A0E", raised: "#0B0D10", surface: "#17171D",
        teal: { 900: "#0F1514", 800: "#151E1D", 700: "#2A3C3A" },
        accent: { DEFAULT: "#F5B301", soft: "#F5C66A" },
        blue: "#0099FF",
        ink: { DEFAULT: "#FFFFFF", body: "#E7E7E2", muted: "#939599", faint: "#636363" },
        ok: "#9BD89A", fail: "#FF6B5A", warn: "#F5C66A",
      },
      fontFamily: {
        display: ["Inter Display", "Inter Tight", "Inter", "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: { card: "10px", btn: "6px", badge: "4px" },
    },
  },
};
```

---

## 2. Patterns Borrowed From Their Landing Page

Each dashboard piece maps to something already on getsolari.com, so the whole thing feels native.

| Their landing page element | Dashboard equivalent |
|---|---|
| "ENV 01 ISOLATED" tiles with tech-stack icons | Submission cards: "FORK 001 BOOTED" with the project's stack icons |
| Browsers / Sandboxes / Desktops tabs in "Use cases" | Filter tabs: All / Browser / Sandbox / Desktop |
| "The fastest browser, by 4x" horizontal latency chart, Solari bar in amber | Stats page charts: boot time distribution, top scores |
| "Full Latency Breakdown" table (Create / Connect / Goto / Release) | Per-run timing table: Create / Clone / Install / Boot / Demo / Release |
| "8ms to spin up" small metric under each product card | Small metric on each card: "Booted in 41s" |
| Code block with Browser / Sandbox / Desktop tabs | Build log viewer with Install / Run / Demo tabs |
| Amber gradient hairline between sections | Same divider between dashboard sections |
| Uppercase JetBrains Mono links ("EXPLORE BROWSERS") | Card actions: "WATCH DEMO", "VIEW REPO" |

Icons: use `cdn.simpleicons.org/<slug>/<hex>` like they do (they load Chrome, Docker, Python, Node, GitHub, etc. this way). Detect stack from the triage step and show 3-4 icons per card.

---

## 3. Pages

### 3.1 Global layout

```
┌──────────────────────────────────────────────────────────────┐
│ Solari Screener        SUBMISSIONS  STATS  HOW IT WORKS  [Opt out] │  sticky glass nav
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    page content (max 1200px)                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Built on Solari. Not affiliated with Pinetree Research.      │
│ GitHub  X  Last scan: 4 min ago                              │
└──────────────────────────────────────────────────────────────┘
```

- Nav links: JetBrains Mono 12px uppercase, `--text-muted`, white on hover, amber underline on active.
- "Opt out" is a ghost button (1px `--border-strong`, `--r-btn`).

### 3.2 Home: `/`

**Hero** (left-aligned, 96px top padding)
- Label: `LIVE SCREENING` in mono amber with a pulsing 6px dot when a scan is running.
- H1 (56px Inter Display): "Every Solari submission, booted and demoed."
- Subtext (16px muted, max 60ch): "Each fork of the Solari repo is cloned into a Solari Sandbox, opened in a Solari Browser or Desktop, and demoed by an AI agent. Updated every 30 minutes."
- Metric row (4 across, mono numbers 32px white, labels 12px mono muted):
  `214 FORKS FOUND` `163 BOOTED` `1,902 VMS LAUNCHED` `38s MEDIAN BOOT`

**Amber gradient divider**

**Controls bar**
```
[ All | Browser | Sandbox | Desktop ]      [Search...]   Sort: Newest ▾   [ ] Only booted
```
- Tabs copy their use-case tabs: text tabs, active one white with a 2px amber bottom border, inactive `--text-muted`.
- Search input: `--surface` bg, 1px `--border`, 6px radius, mono placeholder.

**Submission grid**
- 3 columns desktop, 2 tablet, 1 mobile. 16px gap.

**Submission card** (modeled on their ENV tiles)
```
┌─────────────────────────────────────┐
│ FORK 017                   ● BOOTED │  mono 12px; status dot + label in status color
│                                     │
│ ┌─────────────────────────────────┐ │
│ │      demo thumbnail (16:9)      │ │  plays muted on hover (preview mp4)
│ │              ▶                  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ alice-chen / solari-price-watch     │  Inter Display 18px white
│ Tracks competitor prices across 40  │  14px muted, 2 lines max
│ Shopify stores using parallel...    │
│                                     │
│ [py] [node] [chrome]    DESKTOP SANDBOX │  simple icons left, product badges right
│ ─────────────────────────────────── │
│ Booted in 41s              4.2 / 5  │  mono; score amber if top 10%
└─────────────────────────────────────┘
```
- Card: `--surface` bg, 1px `--border`, `--r-card`, 16px padding.
- Hover: border to `--border-strong`, bg to `--surface-teal-2`. No lift or shadow.
- Product badges: mono 11px uppercase, 1px border in `--border`, 4px radius. The product that was actually used for the demo gets an amber border.
- Failed builds: thumbnail replaced by the last 4 lines of the error log in a `--surface-teal` block with `--fail` text.

**Empty state**: "No submissions match these filters. Clear filters" (link in blue).

### 3.3 Submission detail: `/s/[owner]`

```
← All submissions

alice-chen / solari-price-watch                     [VIEW REPO] [WATCH LIVE]
Tracks competitor prices across 40 Shopify stores...
● BOOTED   Commit 3f2a91c   Scanned 12 min ago

┌──────────────────────────────────────┐  ┌──────────────────────┐
│                                      │  │ SCORE          4.2/5 │
│        demo video (16:9)             │  │ Boots        ████████ 5 │
│                                      │  │ Works        ██████   4 │
│                                      │  │ Uses Solari  ██████   4 │
└──────────────────────────────────────┘  │ Use case     ████████ 5 │
  step timeline: ● click ● type ● scroll  │ Polish       ████     3 │
                                          └──────────────────────┘
AI SUMMARY
Two short paragraphs from the scoring step.

RUN BREAKDOWN   (copies their "Full Latency Breakdown" table)
| Stage   | Create | Clone | Install | Boot  | Demo  | Release | Total |
| Sandbox | 88ms   | 2.1s  | 31.4s   | 6.2s  |  -    | 3ms     | 39.8s |
| Desktop | 0.8ms  |  -    |  -      | 1.1s  | 60.0s | 2ms     | 61.1s |

LOGS   [ Install | Run | Demo agent ]    (tabs styled like their code-sample tabs)
┌──────────────────────────────────────────────────────┐
│ $ npm install                                        │  JetBrains Mono 13px on --surface-teal
│ added 412 packages in 29s                            │  syntax colors from table above
└──────────────────────────────────────────────────────┘
```

- Score bars: 6px tall, `--surface` track, `--accent` fill, 2px radius. Numbers mono on the right.
- Run breakdown table: header row in mono 12px uppercase muted, body in mono 14px, rows separated by 1px `--border`. Highlight the Total column in white, the rest in `--text-body`.
- Demo timeline under the video: small dots for each agent action. Clicking one jumps the video to that frame and shows Claude's reasoning for that step in a tooltip.
- "WATCH LIVE" only shows while a run is active (embeds the desktop `streamUrl`).

### 3.4 Stats: `/stats`

Mirror their benchmark section exactly in style.

1. **H2**: "Screening at scale" + one-line muted subtext.
2. **Horizontal bar chart: median boot time by project type** (web, desktop agent, browser agent, CLI). Same look as their "fastest browser" chart: bars on a dark track, value labels in mono at the bar end, amber for the fastest, `#3B3B3B` for the rest.
3. **Bar chart: which Solari product submissions use** (Browser / Sandbox / Desktop / multiple).
4. **Stat row**: total VMs launched, total VM-minutes, p50 / p95 sandbox create time, failure rate.
5. **Table: most common build failures** (missing env var, wrong Node version, no run script, etc.) with counts. Useful to Harry and to the Solari team.
6. **"Issues found in the SDK"**: list of the GitHub issues and PRs you opened, each with status badge (open / merged).

Use Recharts or plain SVG. Style overrides: no gridlines except a faint vertical at each tick (`rgba(255,255,255,0.04)`), axis labels mono 12px `--text-muted`, no chart border.

### 3.5 How it works: `/how`

A single diagram and 5 short steps: Discover forks → Triage with Claude → Build in Sandbox → Demo in Browser/Desktop → Score. Include a code snippet block with tabs (Sandbox / Browser / Desktop) showing the real SDK calls you use, styled like their "Learn one client" section.

### 3.6 Opt out: `/optout`

- Short copy: "Want your submission removed? Enter your GitHub username. It will be hidden within 24 hours."
- Input + amber primary button "Remove my submission".
- Confirmation: "Removed. Your submission is hidden from the dashboard."

### 3.7 Review view: `/review`

Same grid, but sorted by score, with a compact table toggle:

| # | Owner | Project | Products | Booted | Score | Demo |
|---|---|---|---|---|---|---|

Keyboard shortcuts: `j`/`k` to move, `enter` to open, `o` to open repo.

---

## 4. Components

| Component | Spec |
|---|---|
| Primary button | `--accent` bg, `#080A0E` text, Inter 14px 600, 10px 16px padding, `--r-btn`. Hover `--accent-soft`. |
| Ghost button | Transparent, 1px `--border-strong`, white text. Hover bg `rgba(255,255,255,0.04)`. |
| Mono link | JetBrains Mono 12px uppercase, white, 1px underline offset 4px. Like "EXPLORE BROWSERS". |
| Status pill | 6px dot + mono 11px uppercase label in the status color. No background fill. |
| Product badge | Mono 11px uppercase, 1px `--border`, 4px radius, 2px 6px padding. |
| Metric | Number in mono (white), label below in mono 12px uppercase muted. |
| Tabs | Text only, 14px, muted; active is white with 2px amber bottom border. |
| Divider | 1px amber gradient line (section breaks) or 1px `--border` (inside components). |
| Log block | `--surface-teal` bg, 1px `--line-teal`, 10px radius, 16px padding, horizontal scroll. |
| Video frame | 16:9, `--r-card`, 1px `--border`, `#000` bg, custom play button (amber circle, dark triangle). |

---

## 5. Motion

Keep it quiet, like their site.
- One page-load moment: hero metric numbers count up from 0 over 600ms.
- Live scan dot pulses (opacity 0.4 → 1, 1.6s loop).
- New submissions appearing during a live scan fade in over 200ms.
- Card hover: border color change only, 150ms.
- Respect `prefers-reduced-motion`: disable count-up, pulse, and hover video autoplay.

---

## 6. Responsive

| Breakpoint | Layout |
|---|---|
| ≥1200px | 3-column grid, detail page video + score side by side |
| 810-1199px | 2-column grid, score panel moves under video (their site breaks at 810px too) |
| <810px | 1 column, nav collapses to a menu button, hero H1 drops to 36px, run breakdown table scrolls horizontally |

---

## 7. Accessibility

- Body text `#E7E7E2` and muted `#939599` both pass contrast on `#080A0E`. Do not use `--text-faint` for anything a user needs to read.
- Never rely on color alone for status. Always show the status word next to the dot.
- Visible focus ring: 2px `--accent` outline with 2px offset.
- Videos get captions generated from the agent's step log ("Clicked Add Store", "Typed shopify.com/...").
- All icons have `alt` text with the tech name.

---

## 8. Build Checklist

1. Set up Next.js + Tailwind, paste the tokens and config from Section 1.
2. Load Inter, Inter Tight, JetBrains Mono from Google Fonts.
3. Build components in Section 4 first, in a `/ui` folder.
4. Build `/` with mock data (10 fake submissions covering every status).
5. Build `/s/[owner]` with one mock run including logs and timing.
6. Build `/stats` charts with mock numbers.
7. Wire to Supabase (`submissions` and `runs` tables from the build plan).
8. Add Supabase realtime so new runs appear live during a scan.
9. Build `/optout` and `/review`.
10. Screenshot each page next to getsolari.com and adjust spacing, sizes, and colors until they match.
11. Test on mobile, with reduced motion on, and with keyboard only.
12. Deploy to Vercel.
