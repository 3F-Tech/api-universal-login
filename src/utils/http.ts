import type { Response } from 'express';

/** Metadados de paginação no envelope de resposta de listas. */
export interface ListMeta {
  total: number;
  page: number;
  perPage: number;
}

/** Resposta de item único: `{ "data": { ... } }`. */
export function sendItem<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

/** Resposta de lista: `{ "data": [ ... ], "meta": { total, page, perPage } }`. */
export function sendList<T>(res: Response, data: T[], meta: ListMeta): void {
  res.status(200).json({ data, meta });
}
