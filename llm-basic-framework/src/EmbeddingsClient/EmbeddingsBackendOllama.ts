import { EmbeddingsBackendBase } from './EmbeddingsBackendBase';
import ollama from 'ollama';

export class EmbeddingsBackendOllama implements EmbeddingsBackendBase {
  model: string;
  constructor(args: { model: string }) {
    this.model = args.model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await ollama.embed({
      model: this.model,
      input: text,
    });

    return response.embeddings[0];
  }
}
