/**
 * Expected errors carry a translation key under "errors" so the UI can show a
 * friendly message that says what to do next. Anything else is a bug.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super("unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super("forbidden");
  }
}

export class ReadOnlyError extends AppError {
  constructor() {
    super("readOnly");
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super("rateLimited");
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super("notFound");
  }
}
