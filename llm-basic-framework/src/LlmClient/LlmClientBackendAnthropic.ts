import Anthropic from "@anthropic-ai/sdk";
import { LlmBackendBase } from "./LlmClientBackendBase";

export class LlmClientBackendAnthropic implements LlmBackendBase {
  model: string;
  #client: Anthropic;

  constructor(args: { apiKey: string, model: string }) {
    this.model = args.model;
    this.#client = new Anthropic({ apiKey: args.apiKey });
  }

  async send(instructions: string, text: string): Promise<string> {
    const message = await this.#client.messages.create({
      model: this.model,
      max_tokens: 1000,
      temperature: 0,
      system: instructions,
      messages: [{
        "role": "user",
        "content": [{ "type": "text", text} ]
      }]
    });

    if (message.content[0].type === 'text') {
      return message.content[0].text  
    } else {
      return '';
    }
  }
}
