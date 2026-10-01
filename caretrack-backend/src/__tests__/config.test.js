import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We import config dynamically inside each test so we can mutate process.env
// before the schema runs. Cache must be cleared between runs.
async function loadConfigWithEnv(env) {
  vi.resetModules();
  const ORIGINAL = { ...process.env };
  for (const k of Object.keys(env)) process.env[k] = env[k];
  process.env.NODE_ENV = env.NODE_ENV || "test";
  try {
    return await import("../config.js");
  } finally {
    process.env = ORIGINAL;
  }
}

describe("config / env validation", () => {
  let exitSpy;
  let errorSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("__exit__");
    });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("test-mode fallbacks let config load without a real .env", async () => {
    const mod = await loadConfigWithEnv({});
    expect(mod.default.NODE_ENV).toBe("test");
    expect(mod.default.JWT_SECRET.length).toBeGreaterThan(20);
  });

  it("parses ALLOWED_ORIGINS into a list", async () => {
    const mod = await loadConfigWithEnv({
      ALLOWED_ORIGINS: "http://localhost:5173, https://app.example.com",
    });
    expect(mod.default.ALLOWED_ORIGINS_LIST).toEqual([
      "http://localhost:5173",
      "https://app.example.com",
    ]);
  });

  it("uses SameSite=None in production when cookies cannot be first-party", async () => {
    const secret = "x".repeat(64);
    const mod = await loadConfigWithEnv({
      NODE_ENV: "production",
      JWT_SECRET: secret,
      APP_PUBLIC_URL: "https://app.example.com",
      ALLOWED_ORIGINS: "https://app.example.com",
      DATABASE_URL: "postgresql://u:p@h:5432/db?sslmode=require",
    });
    expect(mod.default.COOKIE_SAMESITE).toBe("none");
  });

  it("keeps SameSite=Lax in production when COOKIE_DOMAIN is set", async () => {
    const secret = "x".repeat(64);
    const mod = await loadConfigWithEnv({
      NODE_ENV: "production",
      JWT_SECRET: secret,
      APP_PUBLIC_URL: "https://app.example.com",
      ALLOWED_ORIGINS: "https://app.example.com",
      DATABASE_URL: "postgresql://u:p@h:5432/db?sslmode=require",
      COOKIE_DOMAIN: ".example.com",
    });
    expect(mod.default.COOKIE_SAMESITE).toBe("lax");
  });

  it("rejects a short JWT_SECRET", async () => {
    await expect(
      loadConfigWithEnv({ JWT_SECRET: "too-short", NODE_ENV: "production" })
    ).rejects.toThrow("__exit__");
  });
});
