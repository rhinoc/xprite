import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("pointer-controller", () => {
  it("pointer-controller behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["apps/editor/src/managers/input/controllers/pointer-controller.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { CanvasPointerController, CanvasPointerTarget } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const touch = (id) => ({ pointerId: id, pointerType: "touch" });
    const pen = (id) => ({ pointerId: id, pointerType: "pen" });
    const mouse = (id) => ({ pointerId: id, pointerType: "mouse" });
    const c = new CanvasPointerController();
    assert.equal(c.begin(touch(1)).action, "edit", "finger-first drawing remains available");
    assert.deepEqual(c.begin(touch(2)), { action: "touch-gesture", interrupt: true });
    assert.equal(c.acceptsMove(mouse(9)), false, "mouse cannot move a finger gesture");
    assert.equal(c.end(touch(2)), true);
    assert.equal(
      c.begin(touch(3)).action,
      "touch-gesture",
      "remaining finger never resumes drawing during a pinch",
    );
    assert.equal(c.end(touch(3)), true);
    assert.equal(c.end(touch(1)), true);
    assert.equal(c.begin(touch(4)).action, "edit");
    assert.deepEqual(
      c.begin(pen(5)),
      { action: "edit", interrupt: true },
      "pen takes ownership from touch",
    );
    assert.equal(c.acceptsMove(touch(4)), false);
    assert.equal(c.cancel(touch(4)), false, "canceled palm does not cancel pen");
    assert.equal(c.acceptsMove(pen(5)), true);
    assert.equal(c.begin(touch(6)).action, "ignore");
    assert.equal(c.acceptsMove(mouse(7)), false, "foreign hover cannot paint a pen stroke");
    assert.equal(c.end(mouse(7)), false);
    assert.equal(c.end(pen(5)), true);
    assert.equal(c.acceptsMove(touch(6)), false, "palm stays suppressed after pen lifts");
    assert.equal(c.end(touch(6)), false);
    assert.equal(c.begin(touch(8)).action, "pan", "auto switches fingers to pan after pen contact");
    c.end(touch(8));
    assert.equal(c.begin(mouse(9)).action, "edit", "mouse behavior remains independent");
    assert.equal(c.begin(pen(10)).action, "ignore", "pen does not steal mouse drag");
    assert.equal(c.cancel(pen(10)), false);
    assert.equal(c.cancel(mouse(9)), true);
    assert.equal(c.end(mouse(9)), false);
    c.setFingerMode("draw");
    assert.equal(c.begin(touch(11)).action, "edit", "explicit draw overrides detection");
    c.setFingerMode("pan");
    assert.equal(c.acceptsMove(touch(11)), true, "preference changes retain active ownership");
    c.end(touch(11));
    assert.equal(c.begin(touch(12)).action, "pan");
    c.begin(touch(13));
    assert.equal(c.cancel(touch(12)), true, "lost capture aborts touch session");
    assert.equal(
      c.acceptsMove(touch(13)),
      false,
      "remaining touch cannot restart after cancellation",
    );
    c.end(touch(13));
    c.setFingerMode("auto");
    c.resetPenDetection();
    assert.equal(c.begin(touch(14)).action, "edit");
    c.reset();
    assert.equal(
      c.acceptsMove(touch(14)),
      false,
      "blur/unmount suppresses physical contacts until lift",
    );
    c.end(touch(14));
    assert.equal(c.begin(touch(14)).action, "edit", "pointer IDs can be reused after release");

    const targeted = new CanvasPointerController();
    targeted.begin(pen(20));
    targeted.end(pen(20));
    assert.equal(targeted.begin(touch(21)).action, "pan", "blank canvas retains Auto navigation");
    targeted.end(touch(21));
    assert.equal(
      targeted.begin(touch(22), CanvasPointerTarget.Editable).action,
      "edit",
      "a hit object or handle takes priority over Auto navigation after pen detection",
    );
    assert.deepEqual(
      targeted.begin(touch(23), CanvasPointerTarget.Editable),
      { action: "touch-gesture", interrupt: true },
      "a second finger still interrupts object editing for pinch/navigation",
    );
    targeted.end(touch(23));
    assert.equal(
      targeted.begin(touch(24), CanvasPointerTarget.Editable).action,
      "touch-gesture",
      "an object hit cannot revive editing while a pinch contact remains",
    );
    targeted.end(touch(24));
    targeted.end(touch(22));
    targeted.setFingerMode("pan");
    assert.equal(targeted.begin(touch(25)).action, "pan");
    targeted.end(touch(25));
    assert.equal(targeted.begin(touch(26), CanvasPointerTarget.Editable).action, "edit");
    targeted.end(touch(26));
    targeted.begin(pen(27));
    assert.equal(
      targeted.begin(touch(28), CanvasPointerTarget.Editable).action,
      "ignore",
      "a hit target cannot defeat palm rejection during a pen stroke",
    );
    targeted.end(pen(27));
    assert.equal(targeted.acceptsMove(touch(28)), false);
    console.log(
      "Pointer arbitration: finger-first drawing, pinch ownership, pen takeover, palm suppression, mouse isolation, preference overrides and cancellation pass.",
    );
    const stagedBundle = await build({
      entryPoints: ["apps/editor/src/managers/input/controllers/staged-touch.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      alias: { "@xprite/ui/utils": "./packages/ui/src/utils.ts" },
    });
    const { StagedTouchIntent } = await import(
      `data:text/javascript;base64,${Buffer.from(stagedBundle.outputFiles[0].contents).toString("base64")}`
    );
    const within = new StagedTouchIntent(
      { clientX: 100, clientY: 100, pointerType: "touch" },
      true,
    );
    assert.equal(
      within.move({ clientX: 104, clientY: 105 }),
      "wait",
      "touch slop cannot start draft editing before a pinch",
    );
    assert.equal(
      within.move({ clientX: 115, clientY: 100 }),
      "edit",
      "deliberate drag inside the draft edits",
    );
    assert.equal(within.move({ clientX: 100, clientY: 100 }), "edit", "activation stays latched");
    const outside = new StagedTouchIntent(
      { clientX: 100, clientY: 100, pointerType: "touch" },
      false,
    );
    assert.equal(outside.move({ clientX: 101, clientY: 101 }), "wait");
    assert.equal(
      outside.move({ clientX: 100, clientY: 120 }),
      "pan",
      "outside-draft drag navigates without committing the draft",
    );
    console.log(
      "Staged touch intent: tap slop, deliberate inside drag and outside navigation pass.",
    );
    const restarted = new CanvasPointerController();
    restarted.begin(mouse(1));
    restarted.reset();
    assert.equal(
      restarted.acceptsMove(mouse(1)),
      false,
      "a remaining contact stays suppressed after blur",
    );
    assert.equal(
      restarted.begin(mouse(1)).action,
      "edit",
      "a fresh down revives an ID whose old up was lost",
    );
    assert.equal(restarted.acceptsMove(mouse(1)), true);
    restarted.end(mouse(1));
    restarted.begin(touch(2));
    restarted.reset();
    assert.equal(restarted.acceptsMove(touch(2)), false);
    assert.equal(restarted.begin(touch(2)).action, "edit", "reused touch ID also starts cleanly");
    const contactBundle = await build({
      entryPoints: ["apps/editor/src/managers/input/controllers/touch-contact.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { createTouchContact, updateTouchContact, touchTapStart, isTouchTap } = await import(
      `data:text/javascript;base64,${Buffer.from(contactBundle.outputFiles[0].contents).toString("base64")}`
    );
    const first = createTouchContact(100, 100, 0);
    const second = createTouchContact(150, 100, 400);
    assert.equal(
      isTouchTap(touchTapStart([first, second]), 450, false, 300),
      false,
      "duration starts at first contact, not second",
    );
    const releaseOnly = createTouchContact(0, 0, 100);
    updateTouchContact(releaseOnly, 20, 0, 12);
    assert.equal(
      isTouchTap(100, 200, releaseOnly.moved, 300),
      false,
      "motion delivered only on release cannot trigger undo",
    );
    updateTouchContact(releaseOnly, 0, 0, 12);
    assert.equal(releaseOnly.moved, true, "moving back cannot turn a drag into a tap");
    assert.equal(
      isTouchTap(
        touchTapStart([createTouchContact(0, 0, 100), createTouchContact(10, 0, 140)]),
        200,
        false,
        300,
      ),
      true,
      "quick stationary multi-contact taps remain available",
    );
    console.log(
      "Lost-release ID reuse and multi-touch final-position/first-contact tap timing regressions pass.",
    );
    class LikePointer {
      get pointerId() {
        return 88;
      }
      get pointerType() {
        return "pen";
      }
    }
    const pointerEventController = new CanvasPointerController();
    const pointerEvent = new LikePointer();
    assert.equal(pointerEventController.begin(pointerEvent).action, "edit");
    assert.equal(
      pointerEventController.acceptsMove(pointerEvent),
      true,
      "DOM prototype getters must be retained as explicit identity values",
    );
    assert.equal(pointerEventController.acceptsMove(touch(99)), false);
    assert.equal(
      pointerEventController.end(pointerEvent),
      true,
      "native-like pointerup releases the owner",
    );
    assert.equal(pointerEventController.begin(touch(99)).action, "pan");
    console.log("Native PointerEvent prototype identity regression passes.");
  }, 60_000);
});
