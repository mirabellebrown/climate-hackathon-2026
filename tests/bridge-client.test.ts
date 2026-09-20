import { describe, expect, it } from "vitest";
import { parseConnectCode } from "@/lib/bridge-client";

const TOKEN = "pair-token-0123456789abcdef";

describe("reading a pairing code in the browser", () => {
  it("accepts a loopback code and keeps only its origin and token", () => {
    expect(parseConnectCode(`  http://127.0.0.1:3000#${TOKEN}  `)).toEqual({ url: "http://127.0.0.1:3000", token: TOKEN });
    expect(parseConnectCode(`http://localhost:4000#${TOKEN}`)).toEqual({ url: "http://localhost:4000", token: TOKEN });
  });
  // A code can only ever point at the machine the browser is on, so a pasted or planted
  // code cannot quietly send this visitor's prompts to someone else's computer.
  it.each([
    `https://someone-else.example#${TOKEN}`,
    `http://192.168.1.10:3000#${TOKEN}`,
    `http://evil.example#${TOKEN}`,
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3000#short",
    "nonsense",
  ])("refuses %j", (code) => expect(parseConnectCode(code)).toBeNull());
});
