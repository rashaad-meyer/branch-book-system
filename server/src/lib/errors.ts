/**
 * Typed API errors. Services throw these; the error-handler middleware maps
 * them to HTTP responses with a consistent envelope:
 *   { error: { code, message, details? } }
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(404, code, message)
  }
}

export class ConflictError extends ApiError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class UnprocessableError extends ApiError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}
