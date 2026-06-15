import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  isAppError,
} from '../../src/utils/errors.js';

describe('errors', () => {
  it('AppError tem defaults 500/INTERNAL_ERROR', () => {
    const err = new AppError('algo quebrou');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(true);
  });

  it('NotFoundError é 404 e aceita code custom', () => {
    const err = new NotFoundError('User 1 not found', { code: 'USER_NOT_FOUND' });
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('USER_NOT_FOUND');
  });

  it('ConflictError=409, ForbiddenError=403', () => {
    expect(new ConflictError().statusCode).toBe(409);
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it('isAppError distingue AppError de Error comum', () => {
    expect(isAppError(new AppError('x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError('string')).toBe(false);
  });
});
