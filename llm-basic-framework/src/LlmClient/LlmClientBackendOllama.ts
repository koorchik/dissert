import ollama from 'ollama'
import { LlmBackendBase } from "./LlmClientBackendBase";

export class LlmBackendOllama implements LlmBackendBase {
  model: string;
  constructor(args: { model: string }) {
    this.model = args.model;
  }

  async send(instructions: string, text: string): Promise<string> {
    const response = await ollama.chat({
      model: this.model,
      messages: [{ role: 'user', content: `${instructions}\n${text}` }],
    });

    console.log(response.message.content)
    return response.message.content;
  }
}