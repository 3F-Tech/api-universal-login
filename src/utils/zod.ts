import { z } from 'zod';

/**
 * Booleano vindo de query string. `z.coerce.boolean()` trataria "false" como
 * `true` (string não-vazia), então restringimos a "true"/"false".
 * Use com `.optional()` por campo.
 */
export const booleanQueryParam = z.enum(['true', 'false']).transform((v) => v === 'true');
