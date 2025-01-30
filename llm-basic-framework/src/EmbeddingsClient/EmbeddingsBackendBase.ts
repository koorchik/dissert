export abstract class EmbeddingsBackendBase {
  abstract embed(text: string): Promise<number[]>
  abstract model: string;
}