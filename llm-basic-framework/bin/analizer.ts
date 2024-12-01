import dotenv from 'dotenv';
dotenv.config();

import { Analyzer } from '../src/Analizer';
import { LlmClient } from '../src/LlmClient/LlmClient';
import { LlmBackendOpenAi } from '../src/LlmClient/LlmClientBackendOpenAi';
import { LlmBackendOllama } from '../src/LlmClient/LlmClientBackendOllama';

async function main() {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY env required');

  // OpenAi models: 
  // gpt-4o
  // gpt-4o-mini
  // o1-preview - slow, expensive, for reasoning.
  // o1-mini - slow, expensive, for reasoning.
  const openAiBackend = new LlmBackendOpenAi({ model: 'gpt-4o', apiKey });
  
  // Ollama models: 
  // llama3.1:70b
  // llama3.1:8b - 8GB GPU (100% of model).
  // llama3.2:3b - 8GB GPU (100% of model)
  // gemma2:27b - 8GB GPU (36% of model, 1-2 min per message),
  // gemma2:9b - 8GB GPU (84% of model).
  // llama3.2:1b - 8GB GPU (100% of model). Unusable: hallucinates indivials heavily.
  // mistral:7b - 8GB GPU (100% of model).  Unusable: does not follow JSON structure.
  // phi3:3.8b - 8GB GPU (100% of model). Unusable: generates a lot of noise, incorrect classification, etc.
  // phi3:14b - 8GB GPU (74% of model). Low quality. TODO: check more.
  const ollamaBackend = new LlmBackendOllama({ model: 'gemma2:27b' });

  const backend = ollamaBackend;

  const analizer = new Analyzer({
    dataDir: './storage/data/cert.gov.ua-news',
    outputDir: `./storage/output/raw/${backend.model.replace(/:/g, '-')}`,
    llmClient: new LlmClient({ backend })
  })
  
  analizer.run();
}

main();