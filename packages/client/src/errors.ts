export class SuperagentClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message)
    this.name = 'SuperagentClientError'
  }
}