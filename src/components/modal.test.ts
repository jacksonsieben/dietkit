import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

const SOURCE = fs.readFileSync(
  path.join(ROOT, "src/components/Modal.tsx"),
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
 * The chrome every modal in this app is built from, so the five properties that
 * make a modal a modal are pinned here rather than left to whoever writes the
 * next one.
 *
 * These read the source: `environment` is `node`, so there is no DOM to render
 * into and `showModal` would not exist if there were. Each check is written
 * against the thing it names, so removing that thing fails the test even though
 * nothing is rendered.
 */
describe("Modal", () => {
  it("opens as a modal rather than as an inline element", () => {
    // `<dialog open>` renders in place: no top layer, no backdrop, no focus
    // trap, and the page behind it still takes clicks. Only `showModal()` makes
    // the content something you have to deal with.
    expect(CODE).toContain("showModal()");
    expect(CODE).not.toMatch(/<dialog[^>]*\sopen[\s=>]/);
  });

  it("never asks through the browser's own boxes", () => {
    // They cannot be translated or styled, and they freeze the tab.
    expect(CODE).not.toContain("window.confirm");
    expect(CODE).not.toMatch(/\bconfirm\(/);
    expect(CODE).not.toMatch(/\balert\(/);
    expect(CODE).not.toMatch(/\bprompt\(/);
  });

  it("routes Escape back through the caller instead of closing itself", () => {
    // The element would close on its own and leave the state that rendered it
    // still saying open — after which the modal cannot be reopened.
    const escape = CODE.slice(CODE.indexOf("onCancel={(event)"));
    const handler = escape.slice(0, escape.indexOf("}}"));

    expect(handler).toContain("event.preventDefault()");
    expect(handler).toContain("onClose()");
  });

  it("treats a click on the backdrop as closing", () => {
    const click = CODE.slice(CODE.indexOf("onClick={(event)"));
    const handler = click.slice(0, click.indexOf("}}"));

    expect(handler).toContain("event.target === dialog.current");
    expect(handler).toContain("onClose()");
  });

  it("names itself for a screen reader", () => {
    expect(SOURCE).toContain("aria-labelledby={titleId}");
  });

  it("only reads the body out where the body is the message", () => {
    // On a form, `aria-describedby` would announce every control before the
    // user reached the first one.
    expect(SOURCE).toContain('role === "alertdialog" ? bodyId : undefined');
  });

  it("gives the keyboard back to whatever opened it", () => {
    // A modal that unmounts on answer takes focus down with it: the element's
    // own restore only fires for a dialog still in the document, so without
    // this the next Tab starts from the top of the page.
    const effect = CODE.slice(CODE.indexOf("useEffect(()"));
    const body = effect.slice(0, effect.indexOf("}, []);"));

    expect(body).toContain("document.activeElement");
    expect(body).toContain("opener.focus()");

    // Guarded, because the opener is often gone with the row it belonged to.
    expect(body).toContain("isConnected");
  });

  it("lets a form say which box the keyboard should land in", () => {
    // `showModal()` focuses the first control in the dialog, which on the weight
    // form is the date — already correct on the day nearly every weighing is
    // entered, and so a Tab spent every morning. React's `autoFocus` cannot fix
    // it from the call site: it focuses during commit, before `showModal()`
    // overrules it, and React does not emit the attribute the platform looks for.
    const effect = CODE.slice(CODE.indexOf("useEffect(()"));
    const body = effect.slice(0, effect.indexOf("return () =>"));

    expect(body).toContain('querySelector<HTMLElement>("[data-autofocus]")');
    expect(body.indexOf("showModal()")).toBeLessThan(
      body.indexOf("data-autofocus"),
    );
  });

  it("has no close control competing for the first focus", () => {
    // Every modal here gives its way out a name. A bare × would be a duplicate
    // and the first thing `showModal()` focused, which is exactly what the
    // button order in `ConfirmDialog` is arranged to prevent.
    expect(CODE).not.toContain("×");
    expect(CODE).not.toMatch(/aria-label=/);
  });
});
