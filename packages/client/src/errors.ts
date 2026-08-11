export class CloudagentClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message)
    this.name = 'CloudagentClientError'
  }
}