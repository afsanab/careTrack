import { describe, it, expect } from "vitest";
const S = require("../schemas");

describe("validation schemas", () => {
  describe("Login", () => {
    it("normalises username to lowercase + trimmed", () => {
      const r = S.Login.safeParse({ username: "  DR.Smith ", password: "hunter22hunter22" });
      expect(r.success).toBe(true);
      expect(r.data.username).toBe("dr.smith");
    });

    it("rejects empty password", () => {
      const r = S.Login.safeParse({ username: "dr.smith", password: "" });
      expect(r.success).toBe(false);
    });

    it("rejects username with whitespace inside", () => {
      const r = S.Login.safeParse({ username: "dr smith", password: "anything12345" });
      expect(r.success).toBe(false);
    });
  });

  describe("RegisterInvite", () => {
    it("requires password length >= 12", () => {
      const r = S.RegisterInvite.safeParse({
        token: "x".repeat(40),
        password: "short",
      });
      expect(r.success).toBe(false);
    });

    it("accepts a valid invite registration", () => {
      const r = S.RegisterInvite.safeParse({
        token: "x".repeat(40),
        password: "12chars-long-pw",
        fullName: "Dr. Jane Smith",
      });
      expect(r.success).toBe(true);
    });
  });

  describe("PatientCreate", () => {
    const base = {
      firstName: "Ada",
      lastName: "Lovelace",
      dob: "1815-12-10",
    };

    it("requires firstName / lastName / dob", () => {
      const r = S.PatientCreate.safeParse({});
      expect(r.success).toBe(false);
    });

    it("rejects DOB that isn't YYYY-MM-DD", () => {
      const r = S.PatientCreate.safeParse({ ...base, dob: "12/10/1815" });
      expect(r.success).toBe(false);
    });

    it("strips unknown keys but accepts known optional ones", () => {
      const r = S.PatientCreate.safeParse({
        ...base,
        notes: "Loves analytical engines",
        room: "101",
        location: "Sunrise Care Center",
      });
      expect(r.success).toBe(true);
      expect(r.data.location).toBe("Sunrise Care Center");
    });

    it("defaults status to 'pending'", () => {
      const r = S.PatientCreate.safeParse(base);
      expect(r.success).toBe(true);
      expect(r.data.status).toBe("pending");
    });

    it("rejects setting status='discharged' on create", () => {
      const r = S.PatientCreate.safeParse({ ...base, status: "discharged" });
      expect(r.success).toBe(false);
    });

    it("accepts a display-name attending physician", () => {
      const r = S.PatientCreate.safeParse({ ...base, physicianUsername: "Dr. Smith" });
      expect(r.success).toBe(true);
      expect(r.data.physicianUsername).toBe("Dr. Smith");
    });

    it("still normalises login-style physician ids", () => {
      const r = S.PatientCreate.safeParse({ ...base, physicianUsername: "DR.Smith" });
      expect(r.success).toBe(true);
      expect(r.data.physicianUsername).toBe("dr.smith");
    });

    it("title-cases names and facility regardless of input case", () => {
      const r = S.PatientCreate.safeParse({
        firstName: "ADA",
        lastName: "o'brien",
        dob: "1815-12-10",
        location: "sunrise CARE center",
        room: "214-a",
        physicianUsername: "dr smith",
        diagnosis: "chest pain",
      });
      expect(r.success).toBe(true);
      expect(r.data.firstName).toBe("Ada");
      expect(r.data.lastName).toBe("O'Brien");
      expect(r.data.location).toBe("Sunrise Care Center");
      expect(r.data.room).toBe("214-A");
      expect(r.data.physicianUsername).toBe("Dr. Smith");
      expect(r.data.diagnosis).toBe("Chest Pain");
    });
  });

  describe("PatientListQuery", () => {
    it("coerces and caps pagination", () => {
      const r = S.PatientListQuery.safeParse({ page: "3", pageSize: "10" });
      expect(r.success).toBe(true);
      expect(r.data.page).toBe(3);
      expect(r.data.pageSize).toBe(10);
    });

    it("rejects pageSize > 100", () => {
      const r = S.PatientListQuery.safeParse({ pageSize: "10000" });
      expect(r.success).toBe(false);
    });
  });

  describe("UUID params", () => {
    it("accepts valid UUID", () => {
      const id = "550e8400-e29b-41d4-a716-446655440000";
      const r = S.IdParam.safeParse({ id });
      expect(r.success).toBe(true);
    });

    it("rejects non-UUID strings (SQL injection guard)", () => {
      const r = S.IdParam.safeParse({ id: "1' OR '1'='1" });
      expect(r.success).toBe(false);
    });
  });
});
