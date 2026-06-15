import { z } from 'zod';

export const validateCredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(1).max(72),
});

export type ValidateCredentialsInput = z.infer<typeof validateCredentialsSchema>;
