import { Ollama } from 'ollama';
import { LlmBackendBase } from "./LlmClientBackendBase";

export class LlmClientBackendOllama implements LlmBackendBase {
  model: string;
  ollama: Ollama
  constructor(args: { model: string, apiKey?: string }) {
    this.model = args.model;

    this.ollama = args.apiKey ? new Ollama({
      host: 'https://ollama.com',
      headers: {
        Authorization: `Bearer ${args.apiKey}`
      }
    }) : new Ollama();
  }

  async send(instructions: string, text: string): Promise<string> {
    const response = await this.ollama.chat({
      model: this.model,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: text }],
    });

    return response.message.content;
  }
}