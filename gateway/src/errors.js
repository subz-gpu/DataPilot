class HttpError extends Error {
  constructor(status, message, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class DuplicateError extends Error {
  constructor(field) {
    super(`Duplicate value for ${field}`);
    this.field = field;
  }
}

module.exports = { HttpError, DuplicateError };
