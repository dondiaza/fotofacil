import test from "node:test";
import assert from "node:assert/strict";
import { injectDrawAnnotation, splitDrawAnnotation } from "../src/lib/draw-annotation";

test("draw annotation preserves clean text and points", () => {
  const text = "Revisar este punto";
  const points = [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.4 },
    { x: 0.5, y: 0.6 }
  ];

  const payload = injectDrawAnnotation(text, points);
  const parsed = splitDrawAnnotation(payload);

  assert.equal(parsed.cleanText, text);
  assert.equal(parsed.points.length >= 2, true);
});

test("draw annotation ignores payload when text has no draw prefix", () => {
  const parsed = splitDrawAnnotation("mensaje sin dibujo");
  assert.equal(parsed.cleanText, "mensaje sin dibujo");
  assert.deepEqual(parsed.points, []);
});
