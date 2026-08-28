import { describe, expect, it } from "vitest";
import { parseJsonObjectBody } from "../request.js";

function requestWithBody(body) {
  return new Request("https://example.test/", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseJsonObjectBody", () => {
  it.each([
    ["null", "null"],
    ["an array", "[]"],
    ["a string", '"str"'],
    ["a number", "42"],
    ["a boolean", "true"],
  ])("returns null for %s", async (_label, body) => {
    await expect(parseJsonObjectBody(requestWithBody(body))).resolves.toBeNull();
  });

  it("returns an empty object for malformed JSON", async () => {
    await expect(parseJsonObjectBody(requestWithBody("{"))).resolves.toEqual({});
  });

  it("returns a valid object unchanged", async () => {
    const body = { name: "SetTimes", nested: { enabled: true } };
    await expect(parseJsonObjectBody(requestWithBody(JSON.stringify(body)))).resolves.toEqual(body);
  });
});
