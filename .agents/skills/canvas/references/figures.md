# Figures

A figure is a self-contained HTML fragment in its own file, `notes/figures/<name>.html`. A note embeds it with one line, `![name](figures/<name>.html)`. The canvas draws it in a sandboxed frame, the way T3 Code draws an `html_render` page:

- the frame's `:root` carries the theme as T3's CSS variables, read from the canvas's own tokens;
- a base sheet sets the background, the text colour, the font and an 8px gutter;
- the frame grows to the figure's height, and it keeps that height when the page draws again.

A fragment that looks right in T3's `html_preview` looks the same on the canvas, in light and in dark.

Use a figure for structure that prose and tables cannot show at a glance: a flow, a pipeline, layers, a before and after, a comparison of options, a timeline, a small chart. A plain list or table needs no figure.

## The flow

1. Write the figure file with one `<style>` and the markup. Add an inline `<script>` only if the figure needs one.
2. Check it with `html_preview` before you embed it. Pass the file's text as `html`, because a path works only in full-access threads.
   - Check it at the default width of 728, once with `appearance: "light"` and once with `"dark"`.
   - Read the screenshot. Fix console errors and anything that reads poorly in either mode.
   - Check it again at width 390 if it must survive narrow pages.
3. Embed it in the note with `![name](figures/<name>.html)`.
4. Read the notices. When a note or a figure changes, the canvas checks each figure against the rules below. It tells you once about each problem, such as a fixed colour, `vh` units, something loaded from outside, or a figure file that is not there. The problem also shows on the note until you fix it.
5. Do not open the canvas to check a figure. The preview already shows how it draws. Open the canvas only when the user asks to see the figure in place.

A small, one-off figure can also go straight in the note's text, in a fenced block whose info string is `html figure`. A block marked plain `html` stays code.

## Rules (T3's, unchanged)

- **Colours:** use the theme variables, never fixed colours. The full set:
  - `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--card`, `--card-foreground`, `--popover`, `--secondary`, `--border`, `--input`, `--ring`;
  - `--primary`, and `--accent`, the brand colour;
  - the tones `--success`, `--info`, `--warning`, `--destructive`;
  - `--code-background`, `--chart-1` to `--chart-6`, `--radius`, `--font-sans`, `--font-mono`.

  Most have a `-foreground`; `accent`, `destructive` and `warning` also have a `-surface` for a tinted fill.
- **Outer element:** leave `html`, `body` and the outer element with no background, card, border, banner title or side padding. The note's page shows through.
- **Sizing:** use fluid widths, such as grid or flex with `minmax(0, 1fr)`. Never use `vh` units, or `height: 100%` on `html` or `body`, because the frame sizes to the content.
- **Boxes:** a box with its own background gets 12–16px padding and `var(--radius)` corners. A chart gets a fixed pixel height.
- **Self-contained:** no external stylesheets or fonts. Scripts run sandboxed, and links open in a new tab.

## A vocabulary that reads well

Nodes are cards: `background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px`. Each has a bold first line, the name, and a muted second line, what it does.

| Meaning | Style |
|---|---|
| Normal step | card |
| Problem or gap | `--warning-surface` fill, `--warning` border |
| Failure or loss | `--destructive-surface` fill, `--destructive` border |
| Good end | `--success` border |
| Side exit or "nothing happens" | dashed `--border`, muted text |
| Numbered layer | 22px circle in `--accent` with `--accent-foreground` |

- **Arrows** are text: `↓` and `→` in `--muted-foreground`, with a short label beside a down arrow saying what passes.
- **Lanes:** parallel paths are flex columns side by side, each headed by a label in small uppercase muted text.
- **Exits:** a three-column grid, `minmax(0,1fr) 28px minmax(0,.8fr)`, holds a step, an arrow, and what leaves the flow there.
- **Labels:** labels follow the canvas skill: Simplified Technical English, and only what earns its keep. A node's first line is a noun, and its second line is one short clause.
- **Size:** text is 13px, with code at 12px. Keep a figure under about 600px high; split a taller one, or cut it to what the note argues.

A starting point, a flow with lanes and outcomes:

```html
<style>
.f{display:flex;flex-direction:column;gap:4px;font-size:13px}
.r{display:flex;gap:8px;align-items:stretch}
.n{flex:1;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px}
.n b{display:block;font-weight:600}
.n span{color:var(--muted-foreground)}
.warn{background:var(--warning-surface);border-color:var(--warning)}
.bad{background:var(--destructive-surface);border-color:var(--destructive)}
.ok{border-color:var(--success)}
.dim{border-style:dashed;color:var(--muted-foreground)}
.a{color:var(--muted-foreground);font-size:12px;display:flex;align-items:center;gap:6px;padding-left:16px}
.a::before{content:"↓";font-size:16px;line-height:1}
.lane{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground)}
</style>
<div class="f">
  <div class="n"><b>Input</b><span>where it comes from</span></div>
  <div class="a">what passes</div>
  <div class="r">
    <div class="lane"><div class="lbl">Path A</div><div class="n"><b>Step</b><span>what it does</span></div></div>
    <div class="lane"><div class="lbl">Path B</div><div class="n warn"><b>Gap</b><span>what is missing</span></div></div>
  </div>
  <div class="a">outcome</div>
  <div class="r">
    <div class="n bad"><b>Fails</b><span>why</span></div>
    <div class="n ok"><b>Kept</b><span>where it goes</span></div>
  </div>
</div>
```
