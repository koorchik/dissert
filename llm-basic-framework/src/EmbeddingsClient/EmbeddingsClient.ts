import type { EmbeddingsBackendBase } from "./EmbeddingsBackendBase";

interface Args {
  backend: EmbeddingsBackendBase,
}

export class EmbeddingsClient {
  #backend: EmbeddingsBackendBase;

  constructor(args: Args) {
    this.#backend = args.backend;
  }

  async embed(text: string) {
    return this.#backend.embed(text);
  }

  get modelName() {
    return this.#backend.model
  }
}