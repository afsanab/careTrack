/**
 * Shared zod schemas. Centralised so route + controller see the same shapes.
 */

const { z } = require("zod");

const UUID = z.string().uuid();

const Username = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Username must be at least 2 characters.")
  .max(80, "Username is too long.")
  .regex(/^[a-z0-9._-]+$/i, "Username may only contain letters, numbers, '.', '_' or '-'.");

const Password = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(200, "Password is too long.");

const Role = z.enum(["physician", "admin"]);

const Status = z.enum(["pending", "inhouse", "discharged"]);

const Iso = z.string().datetime({ offset: true });

const optionalShort = z.string().trim().max(120).nullish().transform((v) => (v ? v : null));
const optionalLong = z.string().trim().max(2000).nullish().transform((v) => (v ? v : null));

const PatientCreate = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD."),
  room: optionalShort,
  arrivalAt: Iso.nullish().transform((v) => v || null),
  diagnosis: optionalLong,
  notes: optionalLong,
  status: Status.exclude(["discharged"]).default("pending"),
  physicianUsername: Username.nullish().transform((v) => v || null),
  location: optionalShort,
});

const PatientUpdate = PatientCreate.partial();

const PatientListQuery = z.object({
  status: Status.optional(),
  physician: Username.optional(),
  location: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const PaginatedQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const IdParam = z.object({ id: UUID });
const PatientIdParam = z.object({ patientId: UUID });
const PatientAndTaskIdParam = z.object({ patientId: UUID, taskId: UUID });

const Login = z.object({
  username: Username,
  password: z.string().min(1, "Password is required.").max(200),
});

const ChangePassword = z.object({
  currentPassword: z.string().min(1, "Current password is required.").max(200),
  newPassword: Password,
});

const RegisterInvite = z.object({
  token: z.string().min(32, "Invite token is missing or malformed.").max(200),
  password: Password,
  fullName: z.string().trim().max(120).optional(),
});

const InviteCreate = z.object({
  username: Username,
  role: Role,
  email: z.string().trim().email().max(200).optional(),
});

const InviteInfoQuery = z.object({
  token: z.string().min(32).max(200),
});

const TaskUpsert = z.object({
  taskKey: z.enum(["hp", "30day", "60day"]),
  taskLabel: z.string().trim().min(1).max(40),
  cycle: z.coerce.number().int().min(0).max(60).default(0),
  dueAt: Iso,
  appearsAt: Iso.nullish().transform((v) => v || null),
});

const TaskAssign = z.object({
  unassign: z.boolean().optional().default(false),
  note: z.string().max(2000).optional(),
});

const TaskNote = z.object({
  note: z.string().max(2000).default(""),
});

const UserUpdate = z.object({
  fullName: z.string().trim().max(120).optional(),
  role: Role.optional(),
  isActive: z.boolean().optional(),
});

const ResetPassword = z.object({
  newPassword: Password,
});

module.exports = {
  IdParam,
  PatientIdParam,
  PatientAndTaskIdParam,
  Login,
  ChangePassword,
  RegisterInvite,
  InviteCreate,
  InviteInfoQuery,
  PatientCreate,
  PatientUpdate,
  PatientListQuery,
  PaginatedQuery,
  TaskUpsert,
  TaskAssign,
  TaskNote,
  UserUpdate,
  ResetPassword,
};
