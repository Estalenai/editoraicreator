export class SearchProviderNotConfiguredError extends Error {
  constructor(provider) {
    super(`Search provider not configured: ${provider}`);
    this.name = "SearchProviderNotConfiguredError";
  }
}

export class SearchProviderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SearchProviderError";
    this.details = details;
  }
}
