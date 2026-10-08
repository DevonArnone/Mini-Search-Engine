---
name: DevDocs Search
description: The stacks. Five official manuals as cloth-bound volumes on one shelf; results as catalog entries.
colors:
  paper: "#F4EFE6"
  paper-raised: "#FBF8F2"
  paper-sunk: "#EAE3D6"
  ink: "#1B1714"
  ink-soft: "#4C4239"
  ink-faint: "#685D51"
  rule: "#D8CFBF"
  rule-strong: "#B0A490"
  marker: "#F7DC84"
  focus: "#1B4DC4"
  ok: "#256334"
  warn: "#8A5200"
  bad: "#9E271F"
  cloth-mdn: "#8E2A2B"
  cloth-react: "#0F6860"
  cloth-nextjs: "#2A2623"
  cloth-typescript: "#2450B8"
  cloth-postgresql: "#8A5E10"
  cloth-ink: "#FBF6EA"
typography:
  display:
    fontFamily: Fraunces
    fontWeight: 500
    letterSpacing: -0.022em
    lineHeight: 1.02
  body:
    fontFamily: Public Sans
    fontSize: 1rem
    lineHeight: 1.625
  measure:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
rounded:
  control: 2px
  surface: 3px
spacing:
  gutter: 1rem
  gutter-wide: 2.5rem
  section: 5rem
components:
  button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: 2.75rem
  field:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: 2.75rem
---

# Design system: DevDocs Search

## Overview

**Creative North Star: "The stacks"**

The interface is a reference library. The five documentation sources are cloth-bound volumes standing on a shelf, and every search result is a catalog entry that says where it came from. The ground is uncoated paper and the type is ink; color belongs to the bookcloths and to nothing else.

**Key characteristics**

- Paper and ink carry the interface. The five cloth colors are the only saturated color, and each one always means its source.
- Content is separated by ruled lines, not enclosed in cards. A bordered surface is reserved for things that lift off the page: menus, sheets, the annotated specimen.
- Corners are square (2px on controls, 3px on lifted surfaces).
- Fraunces sets headings and result titles. Public Sans sets everything a person operates or reads at length. JetBrains Mono is used only for measurements, addresses, counts, and revisions.
- Dark theme is the same room at night: warm black ground, bone ink, the same cloths slightly lifted. It has its own token values; nothing is inverted automatically.

## Colors

Tokens are CSS custom properties in `src/app/globals.css`, stored as RGB channels and exposed through Tailwind (`bg-paper`, `text-ink-soft`, `border-rule`, `bg-cloth`). The frontmatter lists the light values; dark values live beside them under `[data-theme="dark"]`.

- **Paper** (`paper`, `paper-raised`, `paper-sunk`): the page, a lifted surface, and a recess (bar tracks, hover fills).
- **Ink** (`ink`, `ink-soft`, `ink-faint`): primary text and solid buttons; secondary text; the quietest text that still meets 4.5:1 on paper.
- **Rules** (`rule`, `rule-strong`): hairlines between entries; the heavier line that opens a list or frames a control.
- **Marker**: the highlighter laid over matched query terms and text selection. Text on it is always `ink`.
- **Status** (`ok`, `warn`, `bad`): service and freshness states only, always with an icon and words.
- **Cloth**: one per source. `[data-source="react"]` on any ancestor sets `--cloth`, `--cloth-ink` (text stamped on the cloth), and `--cloth-text` (the cloth color adjusted to be readable as text on paper). In the dark theme Next.js becomes bone buckram with dark ink, since graphite would vanish.

Rules: cloth color is never used for anything that is not that source. Status colors are never reused as decoration. Chart series are drawn in ink and ink-soft, with dashes or tone separating them, so cloth and status keep their meanings.

## Typography

- **Display** (`.display`): Fraunces 500, tracking -0.022em, line-height 1.02, sized with `clamp()` up to 5.5rem. Page titles and section statements. An italic is used once, in the home headline.
- **Titles and headings** (`.title`, `.heading`): Fraunces 500 at 1.75–2.25rem and 1.375rem. Result titles use the same face at 1.375rem.
- **Body and controls**: Public Sans on a fixed rem scale (0.6875, 0.75, 0.875, 1, 1.125, 1.375, 1.75, 2.25, 3). Prose is capped at 68ch (`max-w-prose`).
- **Labels** (`.label`): 0.75rem, weight 600, sentence case. Never uppercase with wide tracking, and never placed above a heading as a kicker.
- **Measurements** (`.measure`, `font-mono`): JetBrains Mono with tabular numerals.

## Layout

- One page container (`.page`): max-width 84rem with 1rem, 1.5rem, and 2.5rem gutters.
- The home page is asymmetric: headline and search on the left, the shelf on the right. Sections are divided by `rule-strong` lines and one raised band.
- The search workspace is a 15rem filter rail beside a results column, under a sticky toolbar. Below 1024px the rail becomes a sheet.
- Lists of entries open with a `rule-strong` line and separate items with `rule` lines.
- More space above a heading than below it; sections are separated by 3.5–6rem.

## Components

- **Buttons**: `.button` (solid ink), `.button-quiet` (outlined), `.button-bare` (underlined text). All are at least 2.75rem tall.
- **Field** (`.field`): raised paper, `rule-strong` border that turns ink on focus. The search field carries its own submit button.
- **Segmented control**: adjoining bordered buttons; the selected one is solid ink (updated-within filter, insights period).
- **Chip** (`.chip`): an active filter with its remove button. A workspace's fixed source shows a lock instead.
- **Cloth mark** (`.cloth-mark`): a swatch of the source's cloth stamped with its short mark. A narrow cloth tab stands in where space is tight.
- **Result entry**: rank numeral, cloth mark and source, Fraunces title linking to the official page, mono address, snippet with marker highlights, a metadata line, and a Provenance disclosure. Rank changes only the weight of the numeral.
- **Shelf**: five spines whose widths are proportional to live document counts; the focused or hovered spine rises and its slip appears below the shelf board.
- **Sheet**: a right-hand panel on Radix Dialog for mobile filters and navigation, returning focus to its trigger.
- **Notice** (`.notice`): a bordered message with an icon; a `bad` border marks a failed service.
- **Data table** (`.data-table`): ruled rows, mono numerals right-aligned.
- **Skeleton** (`.skeleton`): sunk-paper blocks in the shape of the content they stand in for.

## Motion

- Controls change over 150ms; menus, sheets, and the navigation indicator over 160–220ms with an exponential ease-out.
- There is one ambient animation: pages travelling through the pipeline figure on the home page. It runs only while on screen and while the index is live, has a pause control, and is replaced by a still arrangement under `prefers-reduced-motion`.
- Results are never re-staggered on a new query; the list dims slightly while updating.

## Rules

- Do show a number only when a service or a recorded measurement supplies it. Omit a statistic that is missing; show a failed service as unavailable.
- Do keep status readable without color: icon plus words.
- Don't enclose list items in cards or nest bordered surfaces.
- Don't put a small label above a heading.
- Don't use mono for anything that is not code, an address, or a measurement.
- Don't add a second accent color; use ink weight, rules, and space.
