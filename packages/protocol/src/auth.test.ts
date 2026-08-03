import { describe, expect, it } from "vitest";
import { credentialsSchema } from "./auth.js";

describe("credentialsSchema", () => {
  it("normalizes valid credentials", () => {
    expect(
      credentialsSchema.parse({
        email: "  PILOT@EXAMPLE.COM ",
        password: "passw0rd",
      }),
    ).toEqual({
      email: "pilot@example.com",
      password: "passw0rd",
    });
  });

  it("rejects malformed emails and passwords outside the existing server limits", () => {
    expect(
      credentialsSchema.safeParse({ email: "pilot", password: "passw0rd" })
        .success,
    ).toBe(false);
    expect(
      credentialsSchema.safeParse({
        email: "pilot@example.com",
        password: "short",
      }).success,
    ).toBe(false);
    expect(
      credentialsSchema.safeParse({
        email: "pilot@example.com",
        password: "a".repeat(201),
      }).success,
    ).toBe(false);
  });
});
