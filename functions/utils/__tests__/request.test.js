import { describe, expect, it } from "vitest";
import { parseJsonObjectBody, parseJsonObjectBodyStrict } from "../request.js";

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

describe("parseJsonObjectBodyStrict", () => {
  it.each([
    ["null", "null"],
    ["an array", "[]"],
    ["a string", '"str"'],
    ["a number", "42"],
    ["a boolean", "true"],
  ])("returns null for %s", async (_label, body) => {
    await expect(parseJsonObjectBodyStrict(requestWithBody(body))).resolves.toBeNull();
  });

  // THE difference from the lenient helper, and the reason it exists: a malformed body
  // is null here and {} there. Endpoints that answered a parse failure with their own
  // explicit 400 need this one; folding them into the lenient helper downgraded that
  // answer to whatever field validation happened to say next.
  it("returns null for malformed JSON, where the lenient helper returns {}", async () => {
    await expect(parseJsonObjectBodyStrict(requestWithBody("{"))).resolves.toBeNull();
    await expect(parseJsonObjectBody(requestWithBody("{"))).resolves.toEqual({});
  });

  it("returns a valid object unchanged", async () => {
    const body = { name: "SetTimes", nested: { enabled: true } };
    await expect(parseJsonObjectBodyStrict(requestWithBody(JSON.stringify(body)))).resolves.toEqual(body);
  });
});
