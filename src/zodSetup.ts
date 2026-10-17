/**
 * Imported first by main.tsx, before any schema exists: Zod must not try `new Function`,
 * which the Content-Security-Policy forbids (spec 09 OP-2). Validation works the same.
 */
import { z } from 'zod';

z.config({ jitless: true });
