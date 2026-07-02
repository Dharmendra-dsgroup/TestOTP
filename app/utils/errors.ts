export class AppError extends Error {
  constructor(
    public override readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
  }
}

export class OtpExpiredError extends AppError {
  constructor() {
    super("OTP has expired. Please request a new one.", 400, "OTP_EXPIRED");
    this.name = "OtpExpiredError";
  }
}

export class OtpInvalidError extends AppError {
  constructor(attemptsRemaining?: number) {
    const message =
      attemptsRemaining !== undefined
        ? `Invalid OTP. ${attemptsRemaining} attempt(s) remaining.`
        : "Invalid OTP.";
    super(message, 400, "OTP_INVALID");
    this.name = "OtpInvalidError";
  }
}

export class OtpMaxAttemptsError extends AppError {
  constructor() {
    super(
      "Maximum OTP verification attempts exceeded.",
      429,
      "OTP_MAX_ATTEMPTS"
    );
    this.name = "OtpMaxAttemptsError";
  }
}

export class ShopNotFoundError extends NotFoundError {
  constructor(shopDomain: string) {
    super(`Shop not found: ${shopDomain}`);
    this.name = "ShopNotFoundError";
  }
}

export class ShopInactiveError extends ForbiddenError {
  constructor() {
    super("Shop account is not active.");
    this.name = "ShopInactiveError";
  }
}

export class OtpQuotaExceededError extends AppError {
  constructor() {
    super(
      "OTP quota exceeded for current billing period. Please upgrade your plan.",
      429,
      "OTP_QUOTA_EXCEEDED"
    );
    this.name = "OtpQuotaExceededError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toHttpError(error: unknown): {
  statusCode: number;
  message: string;
  code: string;
} {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    };
  }

  return {
    statusCode: 500,
    message: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
