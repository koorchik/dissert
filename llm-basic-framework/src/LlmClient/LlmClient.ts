import type { LlmBackendBase } from "./LlmClientBackendBase";

interface Args {
  backend: LlmBackendBase;
}

export class LlmClient {
  #backend: LlmBackendBase;

  constructor(args: Args) {
    this.#backend = args.backend;
  }

  async send(instructions: string, text: string) {
    try {
      return await this.#backend.send(instructions, text);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  get modelName() {
    return this.#backend.model;
  }
}
