import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const phoneSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{6,14}$/,
    "Phone number must be in E.164 format (e.g. +919876543210)"
  );

export const emailSchema = z.string().email("Must be a valid email address");

export const shopDomainSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9-]+\.myshopify\.com$/,
    "Must be a valid myshopify.com domain"
  )
  .transform((v) => v.toLowerCase());

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid ObjectId");

export type PaginationInput = z.infer<typeof paginationSchema>;

export function parseFormData<T>(
  schema: z.ZodSchema<T>,
  formData: FormData
): { data: T; errors: null } | { data: null; errors: Record<string, string> } {
  const raw = Object.fromEntries(formData.entries());
  const result = schema.safeParse(raw);

  if (result.success) {
    return { data: result.data, errors: null };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    errors[key] = issue.message;
  }

  return { data: null, errors };
}

export function parseFormDataArray<T>(
  schema: z.ZodSchema<T>,
  formData: FormData,
  arrayFields: string[] = []
): { data: T; errors: null } | { data: null; errors: Record<string, string> } {
  const raw: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (arrayFields.includes(key)) {
      if (!raw[key]) raw[key] = [];
      (raw[key] as string[]).push(value as string);
    } else {
      raw[key] = value;
    }
  }

  const result = schema.safeParse(raw);

  if (result.success) {
    return { data: result.data, errors: null };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    errors[key] = issue.message;
  }

  return { data: null, errors };
}
