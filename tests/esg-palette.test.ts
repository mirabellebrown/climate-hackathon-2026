import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PALETTES, SURFACES } from "@/lib/esg/palette";

const VALIDATOR = fileURLToPath(new URL("../scripts/validate_palette.js", import.meta.url));
const CSS = readFileSync(fileURLToPath(new URL("../app/reports/esg/esg.css", import.meta.url)), "utf8");

describe("ESG chart palettes pass the validator with zero FAILs", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    for (const mode of ["light", "dark"] as const) {
      it(`${name} · ${mode}`, () => {
        const args = [VALIDATOR, palette[mode].join(","), "--mode", mode, "--surface", SURFACES[mode], "--pairs", palette.pairs];
        const run = spawnSync(process.execPath, args, { encoding: "utf8" });
        expect(run.stdout).not.toContain("[FAIL]");
        expect(run.status, run.stdout + run.stderr).toBe(0);
      });
    }
  }
  it("the stylesheet uses exactly the validated values", () => {
    for (const palette of Object.values(PALETTES)) for (const hex of [...palette.light, ...palette.dark]) expect(CSS.toLowerCase()).toContain(hex);
    expect(CSS).toContain(SURFACES.dark);
  });
});
