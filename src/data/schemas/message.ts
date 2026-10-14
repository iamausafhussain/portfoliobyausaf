/** Contact-form messages (spec 01 §3.3 messages). */
import { z } from 'zod';
import { email, Enums, requiredText, text, timestamp, uuid } from './common';

export const messageRow = z.object({
  id: uuid,
  name: requiredText(80),
  email,
  kind: z.enum(Enums.message_kind),
  subject: text(150),
  body: z
    .string()
    .max(5000, 'Keep it under 5000 characters')
    .refine((s) => s.trim().length >= 10, 'Please write at least 10 characters'),
  budget: text(60).nullable(),
  status: z.enum(Enums.message_status),
  created_at: timestamp,
});
export type Message = z.infer<typeof messageRow>;

/** Exactly the columns a visitor is allowed to send (matches the column grants in 0005_rls.sql). */
export const messageInsert = messageRow
  .pick({ name: true, email: true, kind: true, subject: true, body: true, budget: true })
  .partial({ kind: true, subject: true, budget: true });
export type MessageInsert = z.infer<typeof messageInsert>;

/** The only change the owner can make to a message. */
export const messageStatusUpdate = messageRow.pick({ status: true });
