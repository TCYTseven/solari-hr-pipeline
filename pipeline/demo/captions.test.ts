import assert from "node:assert/strict";
import { test } from "node:test";
import { labelFor, prettyKey, toDemoAction, toPlaywrightKey, toVtt } from "./captions";

test("labelFor produces short captions", () => {
  assert.equal(labelFor("left_click", { coordinate: [10, 20] }, { target: "Add Store" }), "Clicked Add Store");
  assert.equal(labelFor("left_click", { coordinate: [10.4, 20.6] }), "Clicked (10, 21)");
  assert.equal(labelFor("type", { text: "shopify.com/products/widget-pro-max-ultra" }), 'Typed "shopify.com/products/widget-p..."');
  assert.equal(labelFor("key", { text: "Return" }), "Pressed Enter");
  assert.equal(labelFor("key", { text: "ctrl+a" }), "Pressed Ctrl+A");
  assert.equal(labelFor("scroll", { scroll_direction: "down", scroll_amount: 3 }), "Scrolled down");
  assert.equal(labelFor("wait", { duration: 2 }), "Waited 2s");
});

test("labelFor never leaks secrets", () => {
  assert.equal(labelFor("type", { text: "hunter2hunter2" }, { password: true }), "Typed a password");
  assert.equal(labelFor("type", { text: "slr_live_abcdefghijkl" }), "Typed a secret");
  assert.equal(labelFor("type", { text: "my-private-token-value" }, { secrets: ["my-private-token-value"] }), "Typed a secret");
  assert.ok(!labelFor("left_click", {}, { target: "key sk-ant-api03-abcdefghijklmn" }).includes("sk-ant-api03"));
});

test("toPlaywrightKey maps xdotool names", () => {
  assert.equal(toPlaywrightKey("Return"), "Enter");
  assert.equal(toPlaywrightKey("ctrl+shift+t"), "Control+Shift+t");
  assert.equal(toPlaywrightKey("Page_Down"), "PageDown");
  assert.equal(toPlaywrightKey("BackSpace"), "Backspace");
  assert.equal(toPlaywrightKey("super+Up"), "Meta+ArrowUp");
  assert.equal(toPlaywrightKey("f5"), "F5");
  assert.equal(toPlaywrightKey("a"), "a");
  assert.equal(prettyKey("KP_Enter"), "Enter");
});

test("toDemoAction maps toolset members to dashboard actions", () => {
  assert.equal(toDemoAction("double_click"), "click");
  assert.equal(toDemoAction("type"), "type");
  assert.equal(toDemoAction("key"), "key");
  assert.equal(toDemoAction("scroll"), "scroll");
  assert.equal(toDemoAction("wait"), "wait");
  assert.equal(toDemoAction("screenshot"), "screenshot");
});

test("toVtt writes ordered, non-overlapping cues with bounded durations", () => {
  const vtt = toVtt(
    [
      { t: 3.2, action: "type", label: "Typed \"x\"", reasoning: "" },
      { t: 0, action: "navigate", label: "Opened the app", reasoning: "" },
      { t: 20, action: "click", label: "Clicked --> Save", reasoning: "" },
    ],
    22,
  );
  const lines = vtt.split("\n");
  assert.equal(lines[0], "WEBVTT");
  assert.ok(vtt.includes("1\n00:00:00.000 --> 00:00:03.200\nOpened the app"));
  // The second cue is capped at 6s even though the next step is at 20s.
  assert.ok(vtt.includes("2\n00:00:03.200 --> 00:00:09.200\nTyped \"x\""));
  // The last cue ends at the video duration and "-->" in a label is defused.
  assert.ok(vtt.includes("3\n00:00:20.000 --> 00:00:22.000\nClicked -> Save"));
});

test("toVtt merges bursts of steps into one cue", () => {
  const vtt = toVtt([
    { t: 2.9, action: "click", label: "Clicked Product URL", reasoning: "" },
    { t: 3.4, action: "type", label: 'Typed "shop.example.com"', reasoning: "" },
    { t: 4.2, action: "click", label: "Clicked Target price", reasoning: "" },
    { t: 4.6, action: "type", label: 'Typed "50"', reasoning: "" },
    { t: 5.0, action: "click", label: "Clicked Add product", reasoning: "" },
  ]);
  assert.ok(vtt.includes('1\n00:00:02.900 --> 00:00:04.200\nClicked Product URL · Typed "shop.example.com"'));
  assert.ok(vtt.includes('2\n00:00:04.200 --> 00:00:08.200\nClicked Target price · Typed "50" · Clicked Add product'));
  // No cue starts before the previous one ends.
  const times = [...vtt.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/g)].map((m) => [m[1]!, m[2]!]);
  for (let i = 1; i < times.length; i++) assert.ok(times[i]![0] >= times[i - 1]![1]);
});
