import type { CSSProperties } from "react";

import {
  GLYPH_COLS,
  GLYPH_ROWS,
  glyphFor,
  pictogramFor,
  type Dot,
  type PictogramName,
} from "./glyphs";

/**
 * Text as a lit dot-matrix panel (#61).
 *
 * One element per glyph, with every dot a `box-shadow` on its `::before`. The
 * alternative — a `<span>` per cell — costs fifty elements a character and puts
 * a four-digit number at two hundred nodes, which is a lot of DOM for a phone
 * to lay out while someone is holding a kitchen scale.
 *
 * Everything is expressed in `em` against the pitch, so `fontSize` on the
 * container is the single dial: one number scales the dots, the spacing and the
 * panel together, and `clamp()` in CSS can drive it responsively without any
 * of the parts drifting out of register.
 *
 * The cell advance is six columns for a five-column body, which is what makes
 * the unlit grid behind `display` tile seamlessly across a whole word: the
 * panel reads as one piece of hardware rather than as letters with gaps.
 */

/**
 * Dot radii, in cells, for a lit dot and for an unlit one.
 *
 * They differ on purpose, and the difference is the whole legibility of the
 * panel: a lit dot has to win against the grid it sits in, so it is drawn
 * fatter than the cells around it, the way a bulb blooms past its own aperture.
 * Made equal, the number stops being a number and becomes texture — which is
 * exactly what the first build of this looked like on a phone.
 */
const DOT_RADIUS = 0.38;
const UNLIT_RADIUS = 0.22;

/** Five columns of body plus one of side bearing. */
const ADVANCE = GLYPH_COLS + 1;

/**
 * The lit dots, as one shadow each.
 *
 * Offsets rather than spread: a spread on a zero-sized box paints a *square*,
 * because `border-radius: 50%` of nothing is nothing. The `::before` therefore
 * carries a real diameter and each shadow is shifted back by its own radius to
 * land on the centre of its cell.
 */
function shadows(dots: readonly Dot[]): string {
  return dots
    .map(
      ([column, row]) =>
        `${column + 0.5 - DOT_RADIUS}em ${row + 0.5 - DOT_RADIUS}em 0 currentColor`,
    )
    .join(",");
}

/** The face's metrics, handed to the stylesheet so it holds no second copy. */
function panelStyle(): CSSProperties {
  return {
    "--dm-rows": GLYPH_ROWS,
    "--dm-advance": ADVANCE,
    "--dm-dot": `${DOT_RADIUS * 2}em`,
    "--dm-unlit": `${UNLIT_RADIUS}em`,
  } as CSSProperties;
}

interface CellStyle extends CSSProperties {
  "--dm-dots": string;
}

function cellStyle(dots: readonly Dot[]): CellStyle {
  return { "--dm-dots": shadows(dots) };
}

/**
 * The one dial, worked out for a panel that has to fit the column.
 *
 * `DotText` scales entirely from `fontSize`, so fitting a readout to the page
 * is arithmetic on the string's length rather than a layout problem — but the
 * arithmetic has to know the column, not the window: left to `100vw` alone a
 * four-digit target would size itself against a 1400 px desktop it is never
 * allowed to occupy. `48rem` and `3rem` are the charter's column and its two
 * gutters.
 *
 * The ceiling is what a real display does. Past it the pitch stops growing, so
 * a three-digit number is a visibly shorter panel than a four-digit one rather
 * than the same block of light with fatter dots in it — which is the honest
 * picture, because those are not the same quantity.
 *
 * It is also the ramp: `maxPx` is which slot the readout occupies — 26 for the
 * screen's headline, 16 for a reading subordinate to it — and the fit below it
 * is not optional. A subordinate readout used to be written as a bare
 * `fontSize: "16px"`, which is the same thing with the fit thrown away, and at
 * 390 px a four-character panel is 384 px against a 342 px column: `82,4` on
 * /hoje and the calorie target on /energia were both running off the right
 * edge of the phone this app is mostly used on. A pitch that is a ceiling
 * cannot overflow; a pitch that is a constant always can.
 *
 * Exported because several screens draw the same number this way, and the day
 * they disagree about the fit is the day one of them looks broken.
 */
export function displayFontSize(text: string, maxPx = 26): string {
  return `min(${maxPx}px, calc((min(100vw, 48rem) - 3rem) / ${text.length * ADVANCE}))`;
}

export interface DotTextProps {
  children: string;
  /**
   * Draws the unlit cells too, so the panel reads as a display with characters
   * on it rather than as lettering that happens to be dotted. On by default:
   * the whole point of the direction is that the mechanism is visible.
   */
  display?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function DotText({
  children,
  display = true,
  className,
  style,
}: DotTextProps) {
  return (
    <span className={className} style={style}>
      {/* The dots are a rendering of the string, not a second copy of it. The
          real text sits beside them for screen readers, search and selection,
          and the panel itself is hidden from the accessibility tree. */}
      <span
        aria-hidden="true"
        className={display ? "dm dm-display" : "dm"}
        style={panelStyle()}
      >
        {[...children].map((character, index) => (
          <i
            // Position is the identity here: the same letter twice in a word is
            // two panels, and there is no other key to give them.
            key={`${character}-${index}`}
            className="dm-cell"
            style={cellStyle(glyphFor(character))}
          />
        ))}
      </span>
      <span className="sr-only">{children}</span>
    </span>
  );
}

export interface DotIconProps {
  name: PictogramName;
  className?: string;
}

/** A pictogram from the same grid, for places that already carry a text label. */
export function DotIcon({ name, className }: DotIconProps) {
  return (
    <span
      aria-hidden="true"
      className={className ? `dm ${className}` : "dm"}
      style={panelStyle()}
    >
      <i className="dm-cell" style={cellStyle(pictogramFor(name))} />
    </span>
  );
}
