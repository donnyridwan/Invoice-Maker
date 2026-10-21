export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  fieldErrors: Record<string, string[]>;

  constructor(fieldErrors: Record<string, string[]>, message = "Validation failed") {
    super(message);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}
