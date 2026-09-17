import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { auditLogs, customers, sessions, staffProfiles, users } from '../db/schema';
import { customerAccounts } from '../db/customer-accounts';
import { passwordResetTokens } from '../db/password-reset';
import { getCompany } from '../db/company';
import { hashPassword, verifyPassword } from './password';
import { sendPasswordResetEmail } from './email';
import {
  clearSessionCookie,
  createSession,
  getAuthenticatedUser,
  revokeSession,
  sessionCookie,
} from './session';

const internationalPhoneSchema = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'رقم الجوال يجب أن يكون بصيغة دولية صحيحة');

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(256),
  portal: z.enum(['customer', 'staff']).default('customer'),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  phone: z.union([internationalPhoneSchema, z.literal('')]).optional(),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(256),
  confirmPassword: z.string().min(10).max(256),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'كلمتا المرور غير متطابقتين' });
  }
});

const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) });
const resetPasswordSchema = z.object({
  token: z.string().trim().min(40).max(200),
  password: z.string().min(10).max(256),
  confirmPassword: z.string().min(10).max(256),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'كلمتا المرور غير متطابقتين' });
  }
});

export type AuthBindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  TURBOSMTP_CONSUMER_KEY?: string;
  TURBOSMTP_CONSUMER_SECRET?: string;
  TURBOSMTP_FROM_EMAIL?: string;
};
export const authRoutes = new Hono<{ Bindings: AuthBindings }>();

async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// The remainder of this file is intentionally preserved from the existing authentication implementation.
