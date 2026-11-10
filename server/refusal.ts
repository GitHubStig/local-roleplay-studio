/**
 * A request refused for a reason the player can act on (a Limit crossed, a Frame gone, a job in the
 * way): thrown from anywhere under a route, and answered with its message and status (`app.ts`).
 * Each part's own refusals extend it with their status; anything else thrown is a fault, a 500.
 */
export class Refusal extends Error {
  /** The status its kind is answered with: 409, the request is fine but the Session isn't ready. */
  static status = 409
  readonly status: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status ?? (new.target as typeof Refusal).status
  }
}
