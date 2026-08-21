import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

const SOURCE = fs.readFileSync(
  path.join(ROOT, "src/components/ConfirmDialog.tsx"),
  "utf8",
);

const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * The shared question is asked through this component every time something in
 * the app is about to be overwritten or destroyed, so the properties that make
 * it safe to answer are pinned here.
 *
 * The chrome — top layer, focus trap, Escape, focus restore — is `Modal`'s and
 * is tested there. What is left is the part that makes this a question.
 */
describe("ConfirmDialog", () => {
  it("is built on the shared modal rather than on its own dialog", () => {
    // Two implementations of `showModal()` is how one of them ends up without
    // the focus restore.
    expect(CODE).toContain('from "@/components/Modal"');
    expect(CODE).not.toContain("<dialog");
  });

  it("announces itself as an interruption with a consequence", () => {
    // Not a plain `dialog`, which is announced and then waited on: the body of
    // this one has to be read out as it opens.
    expect(CODE).toContain('role="alertdialog"');
  });

  it("closes on Escape and on the backdrop by cancelling", () => {
    // Not by confirming, and not by doing nothing: dismissing a question about
    // losing data means "no".
    expect(CODE).toContain("onClose={onCancel}");
  });

  it("puts the keyboard on the answer that changes nothing", () => {
    // `showModal()` focuses the first focusable element, so the order these two
    // are written in is the whole of this behaviour: someone pressing Enter on
    // a warning they have not finished reading should not be agreeing to it.
    expect(CODE.indexOf("{cancelLabel}")).toBeLessThan(
      CODE.indexOf("{confirmLabel}"),
    );
  });

  it("draws a destructive answer differently from an ordinary one", () => {
    // Two buttons that look the same make the reader work out which one is the
    // one that loses data. The difference is which answer is the filled block,
    // not colour: red in this palette means a number is off target, and a
    // deletion someone asked for is not a fault.
    expect(CODE).toContain('const dangerous = tone === "danger"');
    expect(CODE).toContain("const Confirm = dangerous ? Ghost : ActionButton");
    expect(CODE).toContain("const Cancel = dangerous ? ActionButton : Ghost");
  });

  it("never spends the warning colour on a button", () => {
    // The one red in this app is for a number that is over target. A dialog
    // that borrows it teaches the reader that red means "careful", after which
    // it no longer means anything on the screens that need it.
    expect(CODE).not.toMatch(/red/i);
  });

  it("recommends keeping the data, to the eye and to the keyboard alike", () => {
    // `showModal()` focuses the first focusable element and the cancel is
    // written first, so on a destructive question the filled button and the
    // focused button are the same button. If these two ever disagree, the
    // keyboard user is being pointed at a different answer from everyone else.
    expect(CODE.indexOf("{cancelLabel}")).toBeLessThan(
      CODE.indexOf("{confirmLabel}"),
    );
    expect(CODE).toContain("const Cancel = dangerous ? ActionButton : Ghost");
  });
});
