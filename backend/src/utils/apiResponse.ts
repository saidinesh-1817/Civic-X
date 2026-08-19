import { Response } from 'express';

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export class ApiResponse {
  /**
   * Send a standardized success JSON response
   */
  static success<T>(
    res: Response,
    data: T,
    message: string = 'Operation successful',
    statusCode: number = 200,
    meta?: ResponseMeta
  ): Response {
    const payload: Record<string, unknown> = {
      success: true,
      message,
      data,
    };

    if (meta) {
      payload.meta = meta;
    }

    return res.status(statusCode).json(payload);
  }

  /**
   * Send a standardized 201 Created JSON response
   */
  static created<T>(
    res: Response,
    data: T,
    message: string = 'Resource created successfully'
  ): Response {
    return ApiResponse.success(res, data, message, 201);
  }

  /**
   * Send a standardized error JSON response
   */
  static error(
    res: Response,
    message: string = 'An error occurred',
    statusCode: number = 500,
    errors?: unknown[],
    stack?: string
  ): Response {
    const payload: Record<string, unknown> = {
      success: false,
      message,
    };

    if (errors && errors.length > 0) {
      payload.errors = errors;
    }

    if (stack) {
      payload.stack = stack;
    }

    return res.status(statusCode).json(payload);
  }
}
