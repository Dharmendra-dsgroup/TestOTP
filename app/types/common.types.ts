export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface TimestampFields {
  createdAt: Date;
  updatedAt: Date;
}

export type WithId<T> = T & { _id: string };

export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export function serviceSuccess<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

export function serviceFailure(
  error: string,
  statusCode = 500
): ServiceResult<never> {
  return { success: false, error, statusCode };
}
