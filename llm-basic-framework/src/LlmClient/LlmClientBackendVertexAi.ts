import { VertexAI, GenerateContentCandidate } from "@google-cloud/vertexai";
import { LlmBackendBase } from "./LlmClientBackendBase";

export class LlmClientBackendVertexAi implements LlmBackendBase {
  #vertexAiClient: VertexAI;
  model: string;

  constructor(args: { project: string, location: string, model: string }) {
    this.model = args.model;
    this.#vertexAiClient = new VertexAI({
      project: args.project, location: args.location
    })
  }

  async send(instructions: string, text: string): Promise<string> {
    const generativeModel = this.#vertexAiClient.preview.getGenerativeModel({
      model: this.model,
      generationConfig: {
        'maxOutputTokens': 1024,
        'temperature': 0.2,
        'topP': 0.95,
      },
      systemInstruction: instructions,
    });

    const result: any = await generativeModel.generateContent({
      contents: [
        { role: 'user', parts: [{ text }] }
      ],
    });

    const candidate: GenerateContentCandidate = result.response.candidates[0];
    return candidate.content.parts[0].text || '';
  }
}
