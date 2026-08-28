import type { CSSProperties } from "react";

import type { MacroLine } from "@/lib/diet/reconcile";
import { segmentsFor } from "@/lib/today/segments";

/**
 * The strip itself, with nothing around it.
 *
 * Split out of `GlyphBar` when a second screen needed the same row of lamps at
 * a quieter weight: the arithmetic and the markup are one implementation, and
 * only the height and the pulse are arguments. Always `aria-hidden` — a strip
 * is a picture of a sentence that is printed next to it, and read aloud segment
 * by segment it is noise.
 */

interface SegmentStyle extends CSSProperties {
  "--nd-seg-index": number;
}

export function Strip({
  line,
  quiet = false,
  height = "h-5",
}: {
  line: MacroLine;
  /** Draw a shortfall still rather than seeking. See `SegmentOptions.quiet`. */
  quiet?: boolean;
  height?: string;
}) {
  const segments = segmentsFor(line, { quiet });

  return (
    <div
      aria-hidden="true"
      className="nd-strip flex gap-[3px]"
      /* Set only when the macro has landed, and read by one CSS rule that
         turns the lit segments green. Kept as an attribute rather than a
         class so the strip's own markup stays one shape at every state. */
      data-met={line.state === "on" ? "" : undefined}
    >
      {segments.map((segment, index) => (
        <span
          key={index}
          className={`nd-seg flex-1 ${height}`}
          data-lit={segment}
          style={{ "--nd-seg-index": index } as SegmentStyle}
        />
      ))}
    </div>
  );
}
