import dotenv from 'dotenv';
dotenv.config();

import { Analyzer } from '../src/Analizer';
import { LlmClient } from '../src/LlmClient/LlmClient';
import { LlmBackendOpenAi } from '../src/LlmClient/LlmClientBackendOpenAi';
import { LlmBackendOllama } from '../src/LlmClient/LlmClientBackendOllama';

async function main() {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY env required');

  // OpenAi models: 'gpt-4o', 'gpt-4o-mini'
  const openAiBackend = new LlmBackendOpenAi({ model: 'gpt-4o', apiKey });
  
  // Ollama models: 'llama3.1:70b', 'llama3.2:3b', 'gemma2:27b', 'gemma2:8b'
  const ollamaBackend = new LlmBackendOllama({ model: 'llama3.1:70b' });

  const analizer = new Analyzer({
    dataDir: './data/cert.gov.ua-news',
    llmClient: new LlmClient({
      backend: ollamaBackend
    })
  })
  
  analizer.run();
}

main();