import { EmbeddingsBackendBase } from './EmbeddingsBackendBase';
import OpenAI from 'openai';

export class EmbeddingsBackendOpenAi implements EmbeddingsBackendBase {
  #openAiClient: OpenAI;
  model: string;

  constructor(args: { apiKey: string; model: string }) {
    this.model = args.model;
    this.#openAiClient = new OpenAI({ apiKey: args.apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.#openAiClient.embeddings.create({
      input: text,
      model: this.model,
    });

    return response.data[0].embedding;
  }
}
