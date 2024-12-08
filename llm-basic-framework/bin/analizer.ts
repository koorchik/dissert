import dotenv from 'dotenv';
dotenv.config();

import { Analyzer } from '../src/Analizer';
import { LlmClient } from '../src/LlmClient/LlmClient';
import { LlmClientBackendOpenAi } from '../src/LlmClient/LlmClientBackendOpenAi';
import { LlmClientBackendOllama } from '../src/LlmClient/LlmClientBackendOllama';
import { LlmClientBackendVertexAi } from '../src/LlmClient/LlmClientBackendVertexAi';

async function main() {
  const openAiApiKey = process.env['OPENAI_API_KEY'];
  if (!openAiApiKey) throw new Error('OPENAI_API_KEY env required');

  const vertexAiProject = process.env['VERTEXAI_PROJECT'];
  if (!vertexAiProject) throw new Error('VERTEXAI_PROJECT env required');

  const vertexAiLocation = process.env['VERTEXAI_LOCATION'];
  if (!vertexAiLocation) throw new Error('VERTEXAI_LOCATION env required');

  // OpenAi models: 
  // gpt-4o
  // gpt-4o-mini
  // o1-preview - slow, expensive, for reasoning.
  // o1-mini - slow, expensive, for reasoning.
  const openAiBackend = new LlmClientBackendOpenAi({ model: 'gpt-4o', apiKey: openAiApiKey });

  // Ollama models: 
  // llama3.1:70b - 24GB GPU (52% of model, 1-2 min per message).
  // llama3.1:8b - 8GB GPU (100% of model).
  // llama3.2:3b - 8GB GPU (100% of model)
  // gemma2:27b - 8GB GPU (36% of model, 1-2 min per message), 24GB GPU (100% of model, 2-5 sec per message),
  // gemma2:9b - 8GB GPU (84% of model).
  // llama3.2:1b - 8GB GPU (100% of model). Unusable: hallucinates indivials heavily.
  // mistral:7b - 8GB GPU (100% of model).  Unusable: does not follow JSON structure.
  // phi3:3.8b - 8GB GPU (100% of model). Unusable: generates a lot of noise, incorrect classification, etc.
  // phi3:14b - 8GB GPU (74% of model). Low quality. TODO: check more.
  const ollamaBackend = new LlmClientBackendOllama({ model: 'gemma2:9b' });

  // VertexAi models:
  // gemini-1.5-flash-002
  // gemini-1.5-pro-002
  const vertexAiBackend = new LlmClientBackendVertexAi({
    model: 'gemini-1.5-pro-002',
    project: vertexAiProject,
    location: vertexAiLocation
  });

  const backend = openAiBackend;

  const analizer = new Analyzer({
    dataDir: './storage/data/cert.gov.ua-news',
    outputDir: `./storage/output/raw/${backend.model.replace(/:/g, '-')}`,
    llmClient: new LlmClient({ backend }),
  })

  analizer.run();
}

main();