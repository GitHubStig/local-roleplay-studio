/** What the server answers with when it refuses a request. Shared by the server and the web app: types and plain values only. */

/** A refusal's body: why, and for invalid Settings, each problem found. */
export interface ErrorBody {
  error: string
  issues?: string[]
}
