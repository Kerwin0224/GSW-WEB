# Frontend Design Tokens

> Executable visual-token contract for 文韵智途, the Classical Chinese AI Workbench.

---

## Scenario: Tailwind v4 + shadcn Visual Token System

### 1. Scope / Trigger

- Trigger: any change to `web/src/app/globals.css`, `web/src/app/layout.tsx`, shadcn/ui component styling, Bloom UI, page shell styling, or visual state styling.
- Applies to `web/` only.
- Source-of-truth file: `web/src/app/globals.css`.
- Current repo evidence: `globals.css` already imports `tailwindcss`, `tw-animate-css`, and `shadcn/tailwind.css`; it uses Tailwind v4 `@theme inline`, `@custom-variant dark (&:is(.dark *))`, shadcn CSS variables, and Bloom `--bloom-1..6` variables.
- External-doc evidence: Context7 confirmed Next.js `next/font` variable APIs, Tailwind v4 CSS-first `@theme` variables, and shadcn v4 `@theme inline` plus `.dark` token remapping. Tavily cross-check found Tailwind v4 token guidance using CSS variables and WCAG 2.1 AA contrast rules for text and non-text UI.

### 2. Signatures

Canonical CSS import and dark-mode selector:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
```

Token namespaces:

```css
:root,
.dark {
  --background: <surface>;
  --foreground: <text>;
  --primary: <main-action>;
  --primary-foreground: <text-on-primary>;
  --destructive: <warning-or-delete>;
  --destructive-foreground: <text-on-destructive>;
  --accent: <achievement-or-breakthrough>;
  --accent-foreground: <text-on-accent>;
  --bloom-1: <memory>;
  --bloom-2: <understand>;
  --bloom-3: <apply>;
  --bloom-4: <analyze>;
  --bloom-5: <evaluate>;
  --bloom-6: <create>;
  --radius: 0.75rem;
  --shadow-soft: <low-elevation-shadow>;
  --shadow-ink: <focused-ink-shadow>;
}
```

Tailwind utility mapping:

```css
@theme inline {
  --color-primary: var(--primary);
  --color-bloom-1: var(--bloom-1);
  --font-heading: var(--font-heading);
  --shadow-soft: var(--shadow-soft);
}
```

This mapping must make utilities such as `bg-primary`, `text-primary-foreground`, `bg-bloom-1`, `font-heading`, and `shadow-soft` available without JavaScript Tailwind config.

### 3. Contracts

Visual language:

- Use calm academic styling: rice-paper background, ink foreground, Dai blue primary, cinnabar destructive, Zijin achievement accent.
- Prefer semantic tokens over raw palette colors. Components should say what a color means, not what hue it is.
- Bloom colors identify cognitive levels, not status severity. Status colors still use `primary`, `destructive`, `accent`, `muted`, or component-specific tokens.
- Bloom color is never the only signal. Every Bloom UI must include `L1..L6`, Chinese label, and accessible description or tooltip.
- Dark mode must remap each semantic token explicitly. Do not rely on inversion, opacity overlays, or browser defaults.

Token layering:

- Base values live in comments as hex fallbacks for humans and browser fallback snippets.
- Runtime values use `oklch(...)` because Tailwind v4 and shadcn v4 both document OKLCH token examples.
- Hex fallbacks must be preserved in the token table and, when supporting non-OKLCH browsers, in an `@supports not (color: oklch(0 0 0))` block.
- Semantic tokens (`--primary`, `--accent`, `--destructive`) feed shadcn components.
- Bloom tokens (`--bloom-1..6`) feed Bloom badges, ladders, charts, and learning-path visuals.
- Component styling may use Tailwind utilities generated from `@theme inline`; it must not duplicate the hex or OKLCH value in JSX.

Font contract:

- Heading font is LXGW WenKai TC (`@fontsource/lxgw-wenkai-tc`), loaded via CSS import in `globals.css` using Strategy B. The `@fontsource/lxgw-wenkai` package only ships Latin glyphs and is not suitable for a Chinese-content product.
- The CJK woff2 (`chinese-traditional-400-normal.woff2`) is 1.9MB and is served from `node_modules` via Next.js static asset bundling. `display: swap` is set in the package CSS, so unstyled Chinese text appears immediately while the font loads.
- `--font-heading` resolves to `"LXGW WenKai TC", "霞鹜文楷", "STKaiti", "KaiTi", serif` and is set directly in `:root` — no `next/font/local` variable class is needed.
- Body font remains a system CJK sans stack: `"Source Han Sans SC"`, `"Noto Sans SC"`, `"PingFang SC"`, `"Microsoft YaHei"`, `system-ui`, `sans-serif`.
- Mono font remains `ui-monospace` or the existing `Geist_Mono` variable mapped to `--font-mono`.
- Do not use CDN font CSS for product UI. It can cause layout shift and external availability drift. The fontsource package ships all woff2 files locally — verify with `grep -r "fonts.googleapis\|fonts.gstatic" node_modules/@fontsource/lxgw-wenkai-tc/` before upgrading the package.

Forbidden patterns:

- No hardcoded brand or Bloom hex in source components: `#4A6FA5`, `#C04851`, `#B7A57A`, `#5B8C8D`, `#6B8E6B`, `#C17817`.
- No raw Tailwind palette colors for semantic UI: `text-red-500`, `bg-blue-600`, `border-slate-200`, `text-zinc-500`, `bg-purple-500`.
- No inline style color literals except CSS variable references such as `style={{ backgroundColor: "var(--bloom-3)" }}`.
- No color-only Bloom state, status state, validation state, or chart legend.
- No duplicate token definitions in route/page files.

### 4. Token Tables

Core semantic tokens:

| Token | Light OKLCH | Light fallback | Light foreground | Dark OKLCH | Dark fallback | Dark foreground | Use |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--background` | `oklch(0.979 0.009 93.6)` | `#FAF8F1` | `--foreground` | `oklch(0.228 0.038 282.9)` | `#1A1A2E` | `--foreground` | Main app surface |
| `--foreground` | `oklch(0.297 0.000 89.9)` | `#2D2D2D` | n/a | `oklch(0.979 0.009 93.6)` | `#FAF8F1` | n/a | Primary text |
| `--primary` | `oklch(0.538 0.095 257.8)` | `#4A6FA5` | `#FFFFFF`, 5.11:1 | `oklch(0.703 0.073 251.4)` | `#7EA3CC` | `#1A1A2E`, 6.50:1 | Main action |
| `--destructive` | `oklch(0.567 0.154 19.1)` | `#C04851` | `#FFFFFF`, 4.90:1 | `oklch(0.652 0.160 17.9)` | `#E0606A` | `#1A1A2E`, 4.91:1 | Warning/delete |
| `--accent` | `oklch(0.727 0.062 87.9)` | `#B7A57A` | `#1A1A2E`, 7.05:1 | `oklch(0.823 0.059 89.6)` | `#D4C49A` | `#1A1A2E`, 9.88:1 | Achievement/breakthrough |

Bloom six-level tokens:

| Token | Label | Meaning | Light OKLCH | Light fallback | Required light text | Dark OKLCH | Dark fallback | Required dark text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `--bloom-1` | L1 记忆 | recognize / recall | `oklch(0.538 0.095 257.8)` | `#4A6FA5` | `#FFFFFF`, 5.11:1 | `oklch(0.703 0.073 251.4)` | `#7EA3CC` | `#1A1A2E`, 6.50:1 |
| `--bloom-2` | L2 理解 | explain / summarize | `oklch(0.606 0.053 197.5)` | `#5B8C8D` | `#1A1A2E`, 4.53:1 | `oklch(0.770 0.072 196.9)` | `#7BC3C4` | `#1A1A2E`, 8.48:1 |
| `--bloom-3` | L3 应用 | transfer / use | `oklch(0.610 0.065 144.7)` | `#6B8E6B` | `#1A1A2E`, 4.64:1 | `oklch(0.771 0.123 144.3)` | `#82C982` | `#1A1A2E`, 8.63:1 |
| `--bloom-4` | L4 分析 | compare / decompose | `oklch(0.637 0.135 66.3)` | `#C17817` | `#1A1A2E`, 4.85:1 | `oklch(0.729 0.131 74.9)` | `#D79A3A` | `#1A1A2E`, 6.96:1 |
| `--bloom-5` | L5 评价 | judge / argue | `oklch(0.567 0.154 19.1)` | `#C04851` | `#FFFFFF`, 4.90:1 | `oklch(0.652 0.160 17.9)` | `#E0606A` | `#1A1A2E`, 4.91:1 |
| `--bloom-6` | L6 创造 | compose / recombine | `oklch(0.727 0.062 87.9)` | `#B7A57A` | `#1A1A2E`, 7.05:1 | `oklch(0.823 0.059 89.6)` | `#D4C49A` | `#1A1A2E`, 9.88:1 |

Contrast rules:

- Normal text must meet WCAG 2.1 AA 4.5:1.
- Large text must meet 3:1.
- Meaningful non-text UI controls and graphics must meet 3:1 against adjacent colors.
- If a Bloom color cannot carry white text at 4.5:1, use `--bloom-foreground` or a level-specific foreground token instead of forcing white.

### 5. Copyable `globals.css` Token Block

Use this block as the complete target shape for `web/src/app/globals.css`. Keep the import order and `@custom-variant` selector intact.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-heading: var(--font-heading);

  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-chart-6: var(--chart-6);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --color-bloom-1: var(--bloom-1);
  --color-bloom-2: var(--bloom-2);
  --color-bloom-3: var(--bloom-3);
  --color-bloom-4: var(--bloom-4);
  --color-bloom-5: var(--bloom-5);
  --color-bloom-6: var(--bloom-6);
  --color-bloom-foreground: var(--bloom-foreground);

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);

  --shadow-soft: var(--shadow-soft);
  --shadow-ink: var(--shadow-ink);
}

:root {
  --radius: 0.75rem;
  --shadow-soft: 0 10px 30px -18px rgb(26 26 46 / 0.28);
  --shadow-ink: 0 12px 36px -24px rgb(26 26 46 / 0.38);

  --background: oklch(0.979 0.009 93.6); /* #FAF8F1 */
  --foreground: oklch(0.297 0.000 89.9); /* #2D2D2D */
  --card: oklch(1.000 0.000 89.9); /* #FFFFFF */
  --card-foreground: oklch(0.297 0.000 89.9); /* #2D2D2D */
  --popover: oklch(1.000 0.000 89.9); /* #FFFFFF */
  --popover-foreground: oklch(0.297 0.000 89.9); /* #2D2D2D */

  --primary: oklch(0.538 0.095 257.8); /* #4A6FA5 */
  --primary-foreground: oklch(1.000 0.000 89.9); /* #FFFFFF */
  --secondary: oklch(0.946 0.011 89.7); /* #F0EDE5 */
  --secondary-foreground: oklch(0.297 0.000 89.9); /* #2D2D2D */
  --muted: oklch(0.946 0.011 89.7); /* #F0EDE5 */
  --muted-foreground: oklch(0.623 0.011 72.6); /* #8B8680 */
  --accent: oklch(0.727 0.062 87.9); /* #B7A57A */
  --accent-foreground: oklch(0.228 0.038 282.9); /* #1A1A2E */
  --destructive: oklch(0.567 0.154 19.1); /* #C04851 */
  --destructive-foreground: oklch(1.000 0.000 89.9); /* #FFFFFF */
  --border: oklch(0.861 0.023 80.7); /* #D9D0C1 */
  --input: oklch(0.861 0.023 80.7); /* #D9D0C1 */
  --ring: oklch(0.538 0.095 257.8); /* #4A6FA5 */

  --chart-1: var(--bloom-1);
  --chart-2: var(--bloom-2);
  --chart-3: var(--bloom-3);
  --chart-4: var(--bloom-4);
  --chart-5: var(--bloom-5);
  --chart-6: var(--bloom-6);

  --sidebar: oklch(0.297 0.000 89.9); /* #2D2D2D */
  --sidebar-foreground: oklch(0.979 0.009 93.6); /* #FAF8F1 */
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: oklch(0.360 0.000 89.9);
  --sidebar-accent-foreground: var(--sidebar-foreground);
  --sidebar-border: oklch(0.360 0.000 89.9);
  --sidebar-ring: var(--ring);

  --bloom-1: oklch(0.538 0.095 257.8); /* L1 记忆 #4A6FA5 */
  --bloom-2: oklch(0.606 0.053 197.5); /* L2 理解 #5B8C8D */
  --bloom-3: oklch(0.610 0.065 144.7); /* L3 应用 #6B8E6B */
  --bloom-4: oklch(0.637 0.135 66.3); /* L4 分析 #C17817 */
  --bloom-5: oklch(0.567 0.154 19.1); /* L5 评价 #C04851 */
  --bloom-6: oklch(0.727 0.062 87.9); /* L6 创造 #B7A57A */
  --bloom-foreground: oklch(0.228 0.038 282.9); /* #1A1A2E */

  --font-sans: "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --font-heading: "LXGW WenKai", "霞鹜文楷", "STKaiti", serif;
  --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dark {
  --background: oklch(0.228 0.038 282.9); /* #1A1A2E */
  --foreground: oklch(0.979 0.009 93.6); /* #FAF8F1 */
  --card: oklch(0.270 0.038 282.9);
  --card-foreground: var(--foreground);
  --popover: oklch(0.270 0.038 282.9);
  --popover-foreground: var(--foreground);

  --primary: oklch(0.703 0.073 251.4); /* #7EA3CC */
  --primary-foreground: oklch(0.228 0.038 282.9); /* #1A1A2E */
  --secondary: oklch(0.300 0.028 282.9);
  --secondary-foreground: var(--foreground);
  --muted: oklch(0.300 0.028 282.9);
  --muted-foreground: oklch(0.790 0.010 93.6);
  --accent: oklch(0.823 0.059 89.6); /* #D4C49A */
  --accent-foreground: oklch(0.228 0.038 282.9); /* #1A1A2E */
  --destructive: oklch(0.652 0.160 17.9); /* #E0606A */
  --destructive-foreground: oklch(0.228 0.038 282.9); /* #1A1A2E */
  --border: oklch(0.340 0.030 282.9);
  --input: oklch(0.340 0.030 282.9);
  --ring: var(--primary);

  --chart-1: var(--bloom-1);
  --chart-2: var(--bloom-2);
  --chart-3: var(--bloom-3);
  --chart-4: var(--bloom-4);
  --chart-5: var(--bloom-5);
  --chart-6: var(--bloom-6);

  --sidebar: oklch(0.270 0.038 282.9);
  --sidebar-foreground: var(--foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: oklch(0.320 0.030 282.9);
  --sidebar-accent-foreground: var(--foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);

  --bloom-1: oklch(0.703 0.073 251.4); /* L1 记忆 #7EA3CC */
  --bloom-2: oklch(0.770 0.072 196.9); /* L2 理解 #7BC3C4 */
  --bloom-3: oklch(0.771 0.123 144.3); /* L3 应用 #82C982 */
  --bloom-4: oklch(0.729 0.131 74.9); /* L4 分析 #D79A3A */
  --bloom-5: oklch(0.652 0.160 17.9); /* L5 评价 #E0606A */
  --bloom-6: oklch(0.823 0.059 89.6); /* L6 创造 #D4C49A */
  --bloom-foreground: oklch(0.228 0.038 282.9); /* #1A1A2E */
}

@supports not (color: oklch(0 0 0)) {
  :root {
    --background: #FAF8F1;
    --foreground: #2D2D2D;
    --card: #FFFFFF;
    --card-foreground: #2D2D2D;
    --popover: #FFFFFF;
    --popover-foreground: #2D2D2D;
    --primary: #4A6FA5;
    --primary-foreground: #FFFFFF;
    --secondary: #F0EDE5;
    --secondary-foreground: #2D2D2D;
    --muted: #F0EDE5;
    --muted-foreground: #8B8680;
    --accent: #B7A57A;
    --accent-foreground: #1A1A2E;
    --destructive: #C04851;
    --destructive-foreground: #FFFFFF;
    --border: #D9D0C1;
    --input: #D9D0C1;
    --ring: #4A6FA5;
    --sidebar: #2D2D2D;
    --sidebar-foreground: #FAF8F1;
    --sidebar-primary: #4A6FA5;
    --sidebar-primary-foreground: #FFFFFF;
    --sidebar-accent: #3A3A3A;
    --sidebar-accent-foreground: #FAF8F1;
    --sidebar-border: #3A3A3A;
    --sidebar-ring: #4A6FA5;
    --bloom-1: #4A6FA5;
    --bloom-2: #5B8C8D;
    --bloom-3: #6B8E6B;
    --bloom-4: #C17817;
    --bloom-5: #C04851;
    --bloom-6: #B7A57A;
    --bloom-foreground: #1A1A2E;
  }

  .dark {
    --background: #1A1A2E;
    --foreground: #FAF8F1;
    --card: #22223A;
    --card-foreground: #FAF8F1;
    --popover: #22223A;
    --popover-foreground: #FAF8F1;
    --primary: #7EA3CC;
    --primary-foreground: #1A1A2E;
    --secondary: #2E2E48;
    --secondary-foreground: #FAF8F1;
    --muted: #2E2E48;
    --muted-foreground: #C9C4B8;
    --accent: #D4C49A;
    --accent-foreground: #1A1A2E;
    --destructive: #E0606A;
    --destructive-foreground: #1A1A2E;
    --border: #3A3A56;
    --input: #3A3A56;
    --ring: #7EA3CC;
    --sidebar: #22223A;
    --sidebar-foreground: #FAF8F1;
    --sidebar-primary: #7EA3CC;
    --sidebar-primary-foreground: #1A1A2E;
    --sidebar-accent: #30304C;
    --sidebar-accent-foreground: #FAF8F1;
    --sidebar-border: #3A3A56;
    --sidebar-ring: #7EA3CC;
    --bloom-1: #7EA3CC;
    --bloom-2: #7BC3C4;
    --bloom-3: #82C982;
    --bloom-4: #D79A3A;
    --bloom-5: #E0606A;
    --bloom-6: #D4C49A;
    --bloom-foreground: #1A1A2E;
  }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply bg-background text-foreground font-sans;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    @apply font-heading;
  }
}
```

### 6. Font Loading Contract

Use Next.js font variables in `web/src/app/layout.tsx` so `font-heading` resolves before paint.

LXGW WenKai is not a `next/font/google` import in this stack. Use `next/font/local` for the heading variable, and keep `next/font/google` only for fonts that Next exposes there, such as the existing `Geist_Mono`.

Preferred local-font shape:

```tsx
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const lxgwWenKai = localFont({
  src: "./fonts/LXGWWenKai-Regular.woff2",
  variable: "--font-heading",
  display: "swap",
  fallback: ["STKaiti", "KaiTi", "serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "文韵智途 — 古诗文 AI 教学助手",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${lxgwWenKai.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
```

If the font is installed through `@fontsource/lxgw-wenkai`, do not import its CSS in production UI. Copy the package-provided `.woff2` file into a local app font path and load it through `next/font/local`.

### 7. Good/Base/Bad Cases

- Good: `BloomBadge` receives only a level plus optional className and reads color through `var(--bloom-${level})` or `bg-bloom-{level}`.
- Good: an alert uses `<Alert variant="destructive">` and inherits `--destructive` through shadcn.
- Good: a dashboard card uses `shadow-soft`, `rounded-lg`, `bg-card`, and `text-card-foreground`.
- Base: a one-off chart maps six series to `var(--chart-1)..var(--chart-6)` and labels every series.
- Bad: `<div className="text-red-500">Error</div>`.
- Bad: `<Badge style={{ backgroundColor: "#4A6FA5", color: "white" }}>L1</Badge>`.
- Bad: `.dark .badge { filter: invert(1); }`.

### 8. Tests Required

- Static search: no app source contains hardcoded brand/Bloom hex values except this spec and comments in `globals.css`.
- Static search: no semantic UI uses `text-red-*`, `bg-blue-*`, `border-slate-*`, or `text-zinc-*` for product state.
- Component smoke: all six Bloom levels render level number, Chinese label, and accessible description.
- Visual smoke: light and dark mode both show primary, destructive, accent, and Bloom colors with explicit token values.
- Font smoke: `font-heading` changes computed `font-family` because `--font-heading` is attached through a Next font variable or a local installed font.
- Accessibility smoke: Bloom badges and chart legends remain understandable with color disabled.

### 9. Wrong vs Correct

#### Wrong

```tsx
<Badge className="bg-blue-600 text-white">L1 记忆</Badge>
<p className="text-red-500">Provider missing</p>
```

#### Correct

```tsx
<Badge className="bg-bloom-1 text-primary-foreground" aria-label="布鲁姆 L1 记忆，背诵、识记、找出处">
  L1 记忆
</Badge>

<Alert variant="destructive" role="alert">
  <AlertDescription>Provider missing</AlertDescription>
</Alert>
```

#### Wrong

```css
.dark {
  filter: invert(1);
}
```

#### Correct

```css
.dark {
  --primary: oklch(0.703 0.073 251.4); /* #7EA3CC */
  --destructive: oklch(0.652 0.160 17.9); /* #E0606A */
  --bloom-1: oklch(0.703 0.073 251.4); /* #7EA3CC */
}
```
