// scripts/art-critique.mjs
// Usage: node scripts/art-critique.mjs --image path/to.png
//   or:  node scripts/art-critique.mjs --url http://localhost:5173 --scenario cave
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]);
  return a;
}, []));

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY to run the art critique.");
  process.exit(1);
}

async function getImageB64() {
  if (args.image) return readFileSync(args.image).toString("base64");
  // Playwright path: boot a match into args.scenario and screenshot the canvas.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(args.url ?? "http://localhost:5173");
  // TODO(scenario-driving): drive lobby -> start match with terrain/wall mode per args.scenario,
  // reusing selectors from tests/e2e/full-match.spec.ts. For now, wait then screenshot the canvas.
  await page.waitForTimeout(4000);
  const buf = await page.locator("canvas").first().screenshot();
  await browser.close();
  return buf.toString("base64");
}

const RUBRIC = `You are an art director reviewing a 2D artillery game (Worms Armageddon-style, cartoon-realistic).
Assess the screenshot on these axes and return ONLY JSON:
{ "caves": {"score":1-5,"note":""}, "island": {"score":1-5,"note":""},
  "fill": {"score":1-5,"note":""}, "overall": {"score":1-5,"note":""} }
- caves: do stalactites/stalagmites read as organic rock, or too geometric/uniform?
- island: floating-island underside chunky/organic with tapering + trailing rocks, or a flat wedge?
- fill: terrain textured (grass rim + dirt/rock body, top highlight, darker interior) or flat color?
- overall: is the cartoon-realistic target met? Give one concrete fix in each note.`;

const client = new Anthropic();
const img = await getImageB64();
const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 600,
  system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: "image/png", data: img } },
    { type: "text", text: "Review this screenshot." },
  ] }],
});
console.log(resp.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"));
