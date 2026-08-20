import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

const SOURCE = fs.readFileSync(
  path.join(ROOT, "src/components/ConfirmDialog.tsx"),
  "utf8",
);

/**
 * The same file with its comments taken out.
 *
 * Half of what is checked below is the *absence* of something, and this file
 * explains at length why each of those things is absent. Matching the whole
 * source would let a comment about `window.confirm` fail the test that says
 * `window.confirm` is not called.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * The shared dialog is a component every destructive answer in this app will be
 * asked through, so the properties that make it safe are pinned here rather
 * than left to whoever next opens the file.
 *
 * These read the source: `environment` is `node`, so there is no DOM to render
 * into and `showModal` would not exist if there were. Each check is written
 * against the thing it names, so removing that thing fails the test even though
 * nothing is rendered.
 */
describe("ConfirmDialog", () => {
  it("opens as a modal rather than as an inline element", () => {
    // `<dialog open>` renders in place: no top layer, no backdrop, no focus
    // trap, and the page behind it still takes clicks. Only `showModal()` makes
    // the question something you have to answer.
    expect(CODE).toContain("showModal()");
    expect(CODE).not.toMatch(/<dialog[^>]*\sopen[\s=>]/);
  });

  it("never asks through the browser's own confirm box", () => {
    // `window.confirm` cannot be translated or styled, and it freezes the tab.
    expect(CODE).not.toContain("window.confirm");
    expect(CODE).not.toMatch(/\bconfirm\(/);
    expect(CODE).not.toMatch(/\balert\(/);
  });

  it("routes Escape back through the caller instead of closing itself", () => {
    // The element would close on its own and leave the state that rendered it
    // still saying open — after which the dialog cannot be reopened.
    const escape = CODE.slice(CODE.indexOf("onCancel={(event)"));
    const handler = escape.slice(0, escape.indexOf("}}"));

    expect(handler).toContain("event.preventDefault()");
    expect(handler).toContain("onCancel()");
  });

  it("treats a click on the backdrop as cancelling, not as confirming", () => {
    const click = CODE.slice(CODE.indexOf("onClick={(event)"));
    const handler = click.slice(0, click.indexOf("}}"));

    expect(handler).toContain("event.target === dialog.current");
    expect(handler).toContain("onCancel()");
    expect(handler).not.toContain("onConfirm");
  });

  it("announces itself as an interruption with a consequence", () => {
    expect(SOURCE).toContain('role="alertdialog"');
    expect(SOURCE).toContain("aria-labelledby={titleId}");
    expect(SOURCE).toContain("aria-describedby={bodyId}");
  });

  it("puts the keyboard on the answer that changes nothing", () => {
    // `showModal()` focuses the first focusable element in the dialog, so the
    // order these two are written in is the whole of this behaviour: someone
    // pressing Enter on a warning they have not finished reading should not be
    // agreeing to it.
    expect(CODE.indexOf("{cancelLabel}")).toBeLessThan(
      CODE.indexOf("{confirmLabel}"),
    );
  });

  it("gives the keyboard back to whatever opened it", () => {
    // A modal that unmounts on answer takes focus down with it: the element's
    // own restore only fires for a dialog still in the document, so without
    // this the next Tab starts from the top of the page.
    const effect = CODE.slice(CODE.indexOf("useEffect(()"));
    const body = effect.slice(0, effect.indexOf("}, []);"));

    expect(body).toContain("document.activeElement");
    expect(body).toContain(".focus()");

    // Guarded, because the opener is often gone with the row it belonged to.
    expect(body).toContain("isConnected");
  });

  it("draws a destructive answer differently from an ordinary one", () => {
    // Two buttons that look the same make the reader work out which one is the
    // one that loses data.
    const danger = CODE.slice(CODE.indexOf("const CONFIRM_CLASS"));
    expect(danger.slice(0, danger.indexOf("};"))).toContain("red");
  });
});
