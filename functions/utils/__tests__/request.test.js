import { describe, expect, it } from "vitest";
import { parseJsonObjectBody, parseJsonObjectBodyStrict, parseOptionalJsonObjectBody } from "../request.js";

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

describe("parseOptionalJsonObjectBody", () => {
  // The whole point of this helper is telling "no body" apart from "broken body".
  // The other two collapse them: request.json() throws identically for both.
  it.each([
    ["no body at all", undefined],
    ["an empty string", ""],
    ["only whitespace", "  \n\t "],
  ])("returns {} for %s", async (_label, body) => {
    const request = new Request("https://example.test/", {
      method: "DELETE",
      ...(body === undefined ? {} : { body }),
    });
    await expect(parseOptionalJsonObjectBody(request)).resolves.toEqual({});
  });

  it.each([
    ["malformed JSON", "{oops"],
    ["null", "null"],
    ["an array", "[]"],
    ["a string", '"str"'],
    ["a number", "42"],
  ])("returns null for %s", async (_label, body) => {
    await expect(parseOptionalJsonObjectBody(requestWithBody(body))).resolves.toBeNull();
  });

  it("returns a valid object unchanged", async () => {
    const body = { confirmCascade: true };
    await expect(parseOptionalJsonObjectBody(requestWithBody(JSON.stringify(body)))).resolves.toEqual(body);
  });

  it("is the ONLY helper that separates an empty body from a malformed one", async () => {
    // Pinned as a comparison, because this difference is the entire reason it exists --
    // if a future change collapses it, this fails rather than the difference going quiet.
    const empty = () => new Request("https://example.test/", { method: "DELETE" });
    await expect(parseOptionalJsonObjectBody(empty())).resolves.toEqual({});
    await expect(parseOptionalJsonObjectBody(requestWithBody("{oops"))).resolves.toBeNull();

    await expect(parseJsonObjectBody(empty())).resolves.toEqual({});
    await expect(parseJsonObjectBody(requestWithBody("{oops"))).resolves.toEqual({});

    await expect(parseJsonObjectBodyStrict(empty())).resolves.toBeNull();
    await expect(parseJsonObjectBodyStrict(requestWithBody("{oops"))).resolves.toBeNull();
  });
});
