import { EmbeddingsBackendBase } from './EmbeddingsBackendBase';

export class EmbeddingsBackendVertexAi implements EmbeddingsBackendBase {
  model: string;

  constructor(args: { project: string; location: string; model: string }) {
    this.model = args.model;
  }

  async embed(text: string): Promise<number[]> {
    // TODO
    return [];
  }
}
