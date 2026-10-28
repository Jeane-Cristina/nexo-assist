export type DomainErrorCode =
  | "not_found"
  | "forbidden"
  | "ticket_closed"
  | "not_reopenable"
  | "reopen_window_expired"
  | "unknown_employee";

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  ticket_closed: 409,
  not_reopenable: 409,
  reopen_window_expired: 409,
  unknown_employee: 404,
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly httpStatus: number;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
  }
}
