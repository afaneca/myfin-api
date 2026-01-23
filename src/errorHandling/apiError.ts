export default class APIError extends Error {
  code: number;
  message: string;
  rationale: string;

  constructor(code: number, message: string, rationale?: string) {
    super(message);
    this.code = code;
    this.message = message;
    this.rationale = rationale;
  }

  static badRequest(msg = 'Unknown error', rationale?: string) {
    return new APIError(400, msg, rationale);
  }

  static notAuthorized(
    msg = 'The owner of this request is not authorized to do so.',
    rationale?: string
  ) {
    return new APIError(401, msg, rationale);
  }

  static forbidden(
    msg = 'The owner of this request is not authorized to do so.',
    rationale?: string
  ) {
    return new APIError(403, msg, rationale);
  }

  static notFound(msg = 'The requested resource could not be found.', rationale?: string) {
    return new APIError(404, msg, rationale);
  }

  static notAcceptable(msg = 'The request is not acceptable.', rationale?: string) {
    return new APIError(406, msg, rationale);
  }

  static internalServerError(msg = 'Unknown error', rationale?: string) {
    return new APIError(500, msg, rationale);
  }
}

export enum CommonApiErrorCode {
  RequestPayloadTooLarge = 'REQUEST_PAYLOAD_TOO_LARGE',
}
