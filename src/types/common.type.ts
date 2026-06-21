import { Request } from 'express';

// Custom Request type với user info từ JWT
export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    roleId: number;
    warehouseId?: number;
    employeeCode: string;
    loginHistoryId?: number;
  };
}

// Payload dành cho Khách hàng
export interface CustomerJwtPayload {
  customerId: number;
  role: 'customer';
  email: string;
  phone: string;
}

// Request dành RIÊNG cho Khách hàng
export interface CustomerAuthRequest extends Request {
  user?: CustomerJwtPayload;
}

// Error codes
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  SEND_EMAIL_OUT_LIMIT = 'SEND_EMAIL_OUT_LIMIT',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',

  BAD_REQUEST = 'BAD_REQUEST',
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPage?: number;
  };
  cards?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: any;
    timestamp: string;
    path?: string;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface QueryParams extends PaginationParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
}

export interface JwtPayload {
  id: number;
  email: string;
  roleId: number;
  warehouseId?: number;
  employeeCode: string;
  loginHistoryId?: number;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}
