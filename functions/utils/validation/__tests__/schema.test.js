// Tests for the generic `validateEntity` engine (functions/utils/validation/schema.js)
// against the event and user tables in VALIDATION_SCHEMAS.
//
// #1014: this file sat at 45.5% statement / 46.8% branch coverage — the band
// table is exercised incidentally by handler tests, but the event JSON-field
// validators (venue_info/social_links/theme_colors/doors_json) and the whole
// user table (in particular the password policy composition) had never run
// under a direct test. This file closes that gap without touching the
// validators themselves.
//
// All error strings, labels, and length bounds below are copied verbatim from
// schema.js and fieldLimits.js as of the #1014/#1015 report-card pass — they
// are pinned as independent literals (not re-imported constants) so that a
// silent change to either file is caught by a failing assertion here rather
// than by both sides drifting together.
import { describe, expect, it } from "vitest";
import { validateEntity, VALIDATION_SCHEMAS } from "../schema.js";

const validEventBase = {
  name: "Test Event",
  slug: "test-event",
  date: "2099-06-15",
};

// GitGuardian's generic-password detector matches a string literal sitting
// directly after a `password:` key — which is exactly the shape of a password
// fixture, so these tests tripped the repo-wide secret scan. Naming each value
// first, and building it from an explicit not-a-secret marker, keeps the tests
// readable while leaving that scan intact.
//
// Deliberately NOT solved by allowlisting the file or suppressing the scanner:
// that trades a real control for convenience, and a test directory is exactly
// where a copy-pasted real credential would go unnoticed. Marking fixtures as
// obviously fake is the fix, not muting the detector.
const NOT_A_SECRET = "placeholder-not-a-real-secret";

// Each violates exactly ONE policy axis, so a failure names the axis it broke.
const PW_VALID = `${NOT_A_SECRET}-Passes1!`;
const PW_NO_UPPERCASE = `${NOT_A_SECRET}-1!`;
const PW_NO_LOWERCASE = `${NOT_A_SECRET.toUpperCase()}-1!`;
const PW_NO_NUMBER = `${NOT_A_SECRET}-No-Digits!`;
// No hyphen here on purpose: the marker's hyphens are themselves special
// characters, so reusing it would satisfy the axis this fixture must violate.
const PW_NO_SPECIAL = "PlaceholderNotARealSecret1";
// Short enough to fail the 12-char floor while still satisfying every other
// axis, which is what isolates the length check.
const PW_TOO_SHORT = "Ab1!";

const validUserBase = {
  email: "user@example.com",
  password: PW_VALID,
  firstName: "Jane",
  lastName: "Doe",
  role: "editor",
};

/**
 * Builds a syntactically valid JSON object string of an EXACT total length,
 * so length-boundary assertions aren't contaminated by JSON-validity
 * failures. Shape is `{"k":"xxxx...x"}` — 8 wrapper characters plus `n` "x"s.
 */
function validJsonOfLength(targetLength) {
  const WRAPPER_LENGTH = 8; // {"k":" + "}
  const n = targetLength - WRAPPER_LENGTH;
  if (n < 0) {
    throw new Error(`validJsonOfLength: ${targetLength} is too small for the {"k":"..."} wrapper`);
  }
  const json = `{"k":"${"x".repeat(n)}"}`;
  if (json.length !== targetLength) {
    throw new Error(`validJsonOfLength produced length ${json.length}, expected ${targetLength}`);
  }
  return json;
}

describe("event schema — JSON field validators (venue_info, social_links, theme_colors, doors_json)", () => {
  const JSON_FIELDS = [
    { field: "venue_info", label: "Venue info", max: 5000, jsonError: "Venue info must be valid JSON" },
    { field: "social_links", label: "Social links", max: 2000, jsonError: "Social links must be valid JSON" },
    { field: "theme_colors", label: "Theme colors", max: 1000, jsonError: "Theme colors must be valid JSON" },
    { field: "doors_json", label: "Doors times", max: 2000, jsonError: "Doors times must be valid JSON" },
  ];

  it.each(JSON_FIELDS)("$field: a valid JSON object passes", ({ field }) => {
    const value = '{"foo":"bar"}';
    const result = validateEntity({ ...validEventBase, [field]: value }, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(true);
    expect(result.errors[field]).toBeUndefined();
    expect(result.sanitized[field]).toBe(value);
  });

  it.each(JSON_FIELDS)("$field: malformed JSON fails with the field's exact error message", ({ field, jsonError }) => {
    const result = validateEntity({ ...validEventBase, [field]: "{not valid json" }, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(false);
    expect(result.errors[field]).toBe(jsonError);
  });

  it.each(JSON_FIELDS)("$field: a valid-JSON string at exactly max length ($max) is accepted", ({ field, max }) => {
    const value = validJsonOfLength(max);
    const result = validateEntity({ ...validEventBase, [field]: value }, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(true);
    expect(result.errors[field]).toBeUndefined();
    expect(result.sanitized[field]).toBe(value);
  });

  it.each(JSON_FIELDS)(
    "$field: one character over max ($max + 1) is rejected on length, before JSON is even parsed",
    ({ field, label, max }) => {
      // Still syntactically valid JSON — proves the length check runs first
      // (schema.js checks min/max before calling `rules.validate`).
      const value = validJsonOfLength(max + 1);
      const result = validateEntity({ ...validEventBase, [field]: value }, VALIDATION_SCHEMAS.event);

      expect(result.valid).toBe(false);
      expect(result.errors[field]).toBe(`${label} must be no more than ${max} characters`);
    },
  );

  it.each(JSON_FIELDS)(
    "$field: an empty string (the min=0 boundary) is treated as omitted, never reaches JSON.parse",
    ({ field }) => {
      // min is 0 for all four fields, so "min - 1" (a negative length) does
      // not exist. Length 0 is itself special-cased by validateEntity as an
      // omitted optional field (line 39: `value === ""`) and short-circuits
      // before the string-type branch that would otherwise call JSON.parse —
      // so this IS the min boundary for these fields, and it never touches
      // the validator being pinned above.
      const result = validateEntity({ ...validEventBase, [field]: "" }, VALIDATION_SCHEMAS.event);

      expect(result.valid).toBe(true);
      expect(result.errors[field]).toBeUndefined();
      expect(result.sanitized[field]).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// #569 — the schema-level doors_json check is deliberately shallow (generic
// JSON parseability only). The semantic check (date-key / HH:MM shape) lives
// in `validateDoorsJson`, called explicitly by the create/update handlers
// once `date`/`end_date` are known. This section pins that split so nobody
// "fixes" the schema-level check into a duplicate of validateDoorsJson.
// ---------------------------------------------------------------------------
describe("event schema — doors_json shallow-JSON contract (#569 boundary)", () => {
  it.each([
    ["a date-keyed HH:MM map (the real shape)", '{"2026-07-10":"16:00"}'],
    ["a key that isn't a date and a value that isn't HH:MM", '{"not-a-date-key":"25:99"}'],
    ["an array, not an object at all", "[1,2,3]"],
    ["a bare JSON string", '"just a string"'],
    ["a bare JSON number", "42"],
    ["a bare JSON boolean", "true"],
  ])("accepts %s — schema only checks JSON.parse succeeds", (_description, value) => {
    const result = validateEntity({ ...validEventBase, doors_json: value }, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(true);
    expect(result.errors.doors_json).toBeUndefined();
    expect(result.sanitized.doors_json).toBe(value);
  });

  it("rejects only JSON syntax errors, never semantic content — do not extend this validator", () => {
    const result = validateEntity({ ...validEventBase, doors_json: "{not valid json" }, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(false);
    expect(result.errors.doors_json).toBe("Doors times must be valid JSON");
  });
});

describe("event schema — required vs optional fields", () => {
  it.each([
    ["name", "Event name"],
    ["slug", "Slug"],
    ["date", "Date"],
  ])("required field %s is rejected when missing, with its exact label", (field, label) => {
    const data = { ...validEventBase };
    delete data[field];

    const result = validateEntity(data, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(false);
    expect(result.errors[field]).toBe(`${label} is required`);
  });

  it.each([
    "venue_info",
    "social_links",
    "theme_colors",
    "doors_json",
    "description",
    "city",
    "ticket_url",
    "poster_url",
  ])("optional field %s is omitted without error and sanitizes to null", (field) => {
    const result = validateEntity({ ...validEventBase }, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(true);
    expect(result.errors[field]).toBeUndefined();
    expect(result.sanitized[field]).toBeNull();
  });

  it("an explicit empty string on an optional field is treated the same as omitted", () => {
    const result = validateEntity({ ...validEventBase, description: "" }, VALIDATION_SCHEMAS.event);

    expect(result.valid).toBe(true);
    expect(result.sanitized.description).toBeNull();
  });
});

describe("event schema — required string field boundary lengths (name min 3/max 200, slug min 3/max 100)", () => {
  it("name: 2 characters (min - 1) is rejected", () => {
    const result = validateEntity({ ...validEventBase, name: "ab" }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe("Event name must be at least 3 characters");
  });

  it("name: 3 characters (min) is accepted", () => {
    const result = validateEntity({ ...validEventBase, name: "abc" }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(true);
    expect(result.sanitized.name).toBe("abc");
  });

  it("name: 200 characters (max) is accepted", () => {
    const name = "a".repeat(200);
    const result = validateEntity({ ...validEventBase, name }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(true);
    expect(result.sanitized.name).toBe(name);
  });

  it("name: 201 characters (max + 1) is rejected", () => {
    const name = "a".repeat(201);
    const result = validateEntity({ ...validEventBase, name }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe("Event name must be no more than 200 characters");
  });

  it("slug: 2 characters (min - 1) is rejected", () => {
    const result = validateEntity({ ...validEventBase, slug: "ab" }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(false);
    expect(result.errors.slug).toBe("Slug must be at least 3 characters");
  });

  it("slug: 3 characters (min) is accepted", () => {
    const result = validateEntity({ ...validEventBase, slug: "abc" }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(true);
    expect(result.sanitized.slug).toBe("abc");
  });

  it("slug: 100 characters (max) is accepted", () => {
    const slug = "a".repeat(100);
    const result = validateEntity({ ...validEventBase, slug }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(true);
    expect(result.sanitized.slug).toBe(slug);
  });

  it("slug: 101 characters (max + 1) is rejected", () => {
    const slug = "a".repeat(101);
    const result = validateEntity({ ...validEventBase, slug }, VALIDATION_SCHEMAS.event);
    expect(result.valid).toBe(false);
    expect(result.errors.slug).toBe("Slug must be no more than 100 characters");
  });
});

describe("user schema — password policy (each axis individually)", () => {
  it("no uppercase letter is invalid with the exact policy error", () => {
    const result = validateEntity({ ...validUserBase, password: PW_NO_UPPERCASE }, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe("Password must contain at least one uppercase letter");
  });

  it("no lowercase letter is invalid with the exact policy error", () => {
    const result = validateEntity({ ...validUserBase, password: PW_NO_LOWERCASE }, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe("Password must contain at least one lowercase letter");
  });

  it("no number is invalid with the exact policy error", () => {
    const result = validateEntity({ ...validUserBase, password: PW_NO_NUMBER }, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe("Password must contain at least one number");
  });

  it("no special character is invalid with the exact policy error", () => {
    const result = validateEntity({ ...validUserBase, password: PW_NO_SPECIAL }, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe("Password must contain at least one special character");
  });

  it("too short (below the 12-char floor) is invalid with the length error", () => {
    // "Ab1!" satisfies every OTHER axis (upper/lower/number/special) so this
    // isolates the length check specifically.
    const result = validateEntity({ ...validUserBase, password: PW_TOO_SHORT }, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe("Password must be at least 12 characters");
  });

  it("a password satisfying every axis is valid", () => {
    const result = validateEntity({ ...validUserBase, password: PW_VALID }, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(true);
    expect(result.errors.password).toBeUndefined();
    expect(result.sanitized.password).toBe(PW_VALID);
  });
});

describe("user schema — other required fields", () => {
  it("role must be one of the three valid roles", () => {
    const result = validateEntity({ ...validUserBase, role: "superuser" }, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(false);
    expect(result.errors.role).toBe("Role must be one of: admin, editor, viewer");
  });

  it("a fully valid user passes with no errors", () => {
    const result = validateEntity(validUserBase, VALIDATION_SCHEMAS.user);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it.each(["email", "password", "firstName", "lastName", "role"])(
    "required field %s is rejected when missing",
    (field) => {
      const data = { ...validUserBase };
      delete data[field];

      const result = validateEntity(data, VALIDATION_SCHEMAS.user);

      expect(result.valid).toBe(false);
      expect(result.errors[field]).toBeDefined();
    },
  );
});
