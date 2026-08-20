/**
 * A 5x7 dot-matrix face, drawn here rather than downloaded (#61).
 *
 * The direction's lettering is a dot matrix, and the faces that define that
 * look — Ndot and NType82 — are proprietary and not licensed for redistribution
 * in a web app. Approximating them with the nearest installed sans would be the
 * failure the craft floor names outright, so the technique is built instead: a
 * 5x7 cell font in the same tradition as the character ROMs the look comes from
 * in the first place, rendered as real dots at any size.
 *
 * Every glyph is ten rows of five columns:
 *
 *   rows 0-1  accent zone, empty on unaccented glyphs
 *   rows 2-8  the 5x7 body, which is the whole of a Latin capital or a digit
 *   row  9    descender zone, used by the comma and the cedilla
 *
 * One uniform box means the baseline never moves between `A` and `Á`, which is
 * the property that matters in pt-BR: `PROTEÍNA` has to sit on the same line as
 * `GORDURA` or the panel reads as broken.
 *
 * Lowercase is absent on purpose. A 5x7 cell cannot carry an x-height, an
 * ascender and a descender legibly, so the historical ROMs it descends from
 * either faked it or skipped it. This face skips it, and `glyphFor` upper-cases
 * on the way in.
 */

export const GLYPH_COLS = 5;
export const GLYPH_ROWS = 10;

/** Rows 2-8: the body every glyph shares. */
const BODY_TOP = 2;

/** A lit dot, as `[column, row]` in the 5x10 box. */
export type Dot = readonly [number, number];

const BODIES: Record<string, readonly string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],

  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],

  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11000", "11001", "00010", "00100", "01000", "10011", "00011"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "°": ["01100", "10010", "01100", "00000", "00000", "00000", "00000"],

  /**
   * The tofu. A dot-matrix display shows an unmapped code point as a filled
   * cell, and so does this one: a gap in the face should look like a gap in the
   * face, not like a word with a hole in it.
   */
  "�": ["11111", "11111", "11111", "11111", "11111", "11111", "11111"],
};

/** Rows 0-1, above the body. */
const ACCENTS: Record<string, readonly [string, string]> = {
  acute: ["00010", "00100"],
  grave: ["01000", "00100"],
  circumflex: ["00100", "01010"],
  tilde: ["01101", "10110"],
};

/** Row 9, below the body. Only the cedilla reaches it. */
const CEDILLA = "00100";

const DECOMPOSED: Record<string, readonly [string, keyof typeof ACCENTS]> = {
  "Á": ["A", "acute"],
  "À": ["A", "grave"],
  "Â": ["A", "circumflex"],
  "Ã": ["A", "tilde"],
  "É": ["E", "acute"],
  "Ê": ["E", "circumflex"],
  "Í": ["I", "acute"],
  "Ó": ["O", "acute"],
  "Ô": ["O", "circumflex"],
  "Õ": ["O", "tilde"],
  "Ú": ["U", "acute"],
};

const CEDILLAED = "Ç";

function dotsFrom(rows: readonly string[], top: number, into: Dot[]): void {
  rows.forEach((row, index) => {
    for (let column = 0; column < GLYPH_COLS; column += 1) {
      if (row[column] === "1") into.push([column, top + index]);
    }
  });
}

/**
 * The lit dots for one character, in the 5x10 box.
 *
 * Unmapped characters return the tofu rather than throwing: this face is
 * reached through translated copy, and a message key gaining a character the
 * face does not carry should be visible on screen in review, not a crash in
 * front of the user.
 */
export function glyphFor(character: string): readonly Dot[] {
  const upper = character.toUpperCase();
  const dots: Dot[] = [];

  if (upper === CEDILLAED) {
    dotsFrom(BODIES.C, BODY_TOP, dots);
    dotsFrom([CEDILLA], GLYPH_ROWS - 1, dots);
    return dots;
  }

  const decomposed = DECOMPOSED[upper];
  if (decomposed) {
    const [base, accent] = decomposed;
    dotsFrom(ACCENTS[accent], 0, dots);
    dotsFrom(BODIES[base], BODY_TOP, dots);
    return dots;
  }

  dotsFrom(BODIES[upper] ?? BODIES["�"], BODY_TOP, dots);
  return dots;
}

/**
 * Pictograms on the same 5x7 grid as the letters (#61).
 *
 * The tab bar needs icons, and an icon set drawn in a different medium from the
 * type beside it is two design systems sharing a strip of screen. Building them
 * out of the same cells means the bar has one grammar: every mark on it, letter
 * or picture, is dots at the same pitch.
 */
export const PICTOGRAMS = {
  today: ["01010", "11111", "10001", "10001", "10111", "10111", "11111"],
  diet: ["01010", "00100", "00000", "11111", "10001", "10001", "01110"],
  weight: ["01110", "10001", "10101", "10011", "10001", "01110", "00000"],
  training: ["00000", "00000", "10001", "11111", "10001", "00000", "00000"],
  more: ["00000", "10101", "00000", "10101", "00000", "10101", "00000"],
} as const;

export type PictogramName = keyof typeof PICTOGRAMS;

export function pictogramFor(name: PictogramName): readonly Dot[] {
  const dots: Dot[] = [];
  dotsFrom(PICTOGRAMS[name], BODY_TOP, dots);
  return dots;
}
