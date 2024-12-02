import OpenAI from "openai";
import { LlmBackendBase } from "./LlmClientBackendBase";

export class LlmClientBackendOpenAi implements LlmBackendBase {
  #openAiClient: OpenAI;
  model: string;

  constructor(args: { apiKey: string, model: string }) {
    this.model = args.model;
    this.#openAiClient = new OpenAI({ apiKey: args.apiKey });
  }

  async send(instructions: string, text: string): Promise<string> {
    const chatCompletion = await this.#openAiClient.chat.completions.create({
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: text }
      ],
      model: this.model
    });

    console.log(chatCompletion.choices[0].message.content);
    return chatCompletion.choices[0].message.content || '';
  }
}