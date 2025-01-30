import type { LlmBackendBase } from "./LlmClientBackendBase";

interface Args {
  backend: LlmBackendBase,
}

export class LlmClient {
  #backend: LlmBackendBase;

  constructor(args: Args) {
    this.#backend = args.backend;
  }

  async send(instructions: string, text: string) {
    return this.#backend.send(instructions, text);
  }

  get modelName() {
    return this.#backend.model
  }
}