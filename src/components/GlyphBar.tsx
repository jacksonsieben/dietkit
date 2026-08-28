import { Strip } from "@/components/nd/Strip";
import type { MacroLine } from "@/lib/diet/reconcile";

/**
 * One macro, read as a strip of lamps.
 *
 * The predecessor drew progress bars, and a progress bar has a property this
 * screen cannot afford: it is continuous, so at arm's length in bad kitchen
 * light "nearly there" and "there" are the same picture. A strip of discrete
 * segments is countable — the eye lands on the boundary between lit and unlit
 * without reading a number, and the difference between 22 of 24 and 24 of 24 is
 * two visible gaps rather than four pixels of fill.
 *
 * State is carried three ways, because PRODUCT.md forbids colour being the only
 * carrier: by how much of the strip is lit, by the pulse travelling across what
 * is missing, and — for anyone who reads none of that — by the sentence
 * underneath, which says the same thing in words.
 *
 * `segmentsFor` decides which segment is which; this file only draws them. The
 * split is the repo's rule (logic in `lib/`, components render) and it is what
 * lets the interesting arithmetic — a barely-started plan must still light one
 * lamp, a nearly-finished one must still leave one dark — be tested without a
 * DOM.
 */

interface GlyphBarProps {
  /** The macro's own name, in words. */
  label: string;
  /** "128 de 165 g" — the reading, spelled out. */
  reading: string;
  /** "faltam 37 g", "12 g acima", "fecha". */
  status: string;
  line: MacroLine;
}

export function GlyphBar({ label, reading, status, line }: GlyphBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-medium tracking-[0.18em] uppercase">
          {label}
        </span>
        <span className="font-mono text-xs text-nd-dim" data-numeric="">
          {reading}
        </span>
      </div>

      <Strip line={line} />

      <span className={statusClass(line)}>{status}</span>
    </div>
  );
}

/**
 * The two hues, at their two ends: green for landed, red for gone past.
 *
 * The ordinary business of a plan not being finished yet gets neither — it
 * stays grey. A screen that is red all morning teaches the user that red means
 * nothing, and a screen that is green before the day is done teaches the same
 * about green. Both words are printed either way, so this is the second carrier
 * and never the only one.
 */
function statusClass(line: MacroLine): string {
  const base = "text-xs";
  if (line.state === "over") return `${base} text-nd-red-ink`;
  if (line.state === "on") return `${base} text-nd-good`;
  return `${base} text-nd-dim`;
}
