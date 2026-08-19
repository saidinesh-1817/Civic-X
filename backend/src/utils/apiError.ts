export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: unknown[];

  constructor(
    statusCode: number,
    message: string,
    errors?: unknown[],
    isOperational: boolean = true,
    stack: string = ''
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad Request', errors?: unknown[]) {
    super(400, message, errors);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized access', errors?: unknown[]) {
    super(401, message, errors);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden - Access denied', errors?: unknown[]) {
    super(403, message, errors);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict', errors?: unknown[]) {
    super(409, message, errors);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed', errors?: unknown[]) {
    super(422, message, errors);
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error', errors?: unknown[]) {
    super(500, message, errors, false);
  }
}
