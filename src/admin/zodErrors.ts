/**
 * Plain-language validation messages for the admin forms (spec 02 AD-20).
 * Messages written into individual schemas take precedence over these.
 */
import { z } from 'zod';

let installed = false;

export function installAdminErrorMessages() {
  if (installed) return;
  installed = true;
  z.config({
    customError: (iss) => {
      const input = (iss as { input?: unknown }).input;
      if (input === undefined || input === null || input === '') return 'Required';
      switch (iss.code) {
        case 'too_big':
          if (iss.origin === 'string') return `Keep it under ${Number(iss.maximum) + 1} characters`;
          if (iss.origin === 'array') return `At most ${String(iss.maximum)} items`;
          if (iss.origin === 'number') return `Must be ${String(iss.maximum)} or less`;
          return undefined;
        case 'too_small':
          if (iss.origin === 'string')
            return Number(iss.minimum) <= 1 ? 'Required' : `At least ${String(iss.minimum)} characters`;
          if (iss.origin === 'array') return `Add at least ${String(iss.minimum)}`;
          if (iss.origin === 'number') return `Must be ${String(iss.minimum)} or more`;
          return undefined;
        case 'invalid_value':
          return 'Choose one of the options';
        case 'invalid_format':
          if (iss.format === 'date') return 'Enter a valid date';
          return undefined;
        case 'invalid_type':
          if (iss.expected === 'number') return 'Enter a number';
          return 'Required';
        default:
          return undefined;
      }
    },
  });
}
