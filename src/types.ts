export type UserRole = "client" | "admin";

export type CorrelationId = string;

export type ThreatCode =
  | "INSTRUCTION_OVERRIDE"
  | "PROMPT_EXFILTRATION"
  | "CONTROL_TOKEN_ATTACK"
  | "SECRET_IN_OUTPUT"
  | "JWT_IN_OUTPUT"
  | "AWS_KEY_IN_OUTPUT"
  | "INJECTION_ECHO";

export type AuditStatus = "allowed" | "blocked" | "error";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  model: "gpt-4o" | "claude-3-5-sonnet";
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
};

export type ProviderRequest = {
  model: ChatRequest["model"];
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type ProviderResponse = {
  content: string;
  model: string;
};

export type AuditRecord = {
  timestamp: Date;
  correlationId: string;
  apiKeyId?: string;
  model?: string;
  requestHash?: string;
  responseHash?: string;
  detectedThreats: ThreatCode[];
  piiTokenCount: number;
  latencyMs: number;
  status: AuditStatus;
  reason?: string;
};
