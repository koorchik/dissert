export abstract class LlmBackendBase {
  abstract send(instructions: string, text: string): Promise<string>
}