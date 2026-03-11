export class ProviderNotConfiguredError extends Error {
  constructor(provider) {
    super(`AI provider not configured: ${provider}`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class AIProviderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AIProviderError";
    this.details = details;
  }
}
