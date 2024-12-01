import dotenv from 'dotenv';
dotenv.config();

import { Analyzer } from '../src/Analizer';
import { LlmClient } from '../src/LlmClient/LlmClient';
import { LlmBackendOpenAi } from '../src/LlmClient/LlmClientBackendOpenAi';
import { LlmBackendOllama } from '../src/LlmClient/LlmClientBackendOllama';

async function main() {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY env required');

  const openAiBackend = new LlmBackendOpenAi({ model: 'gpt-4o', apiKey });
  const ollamaBackend = new LlmBackendOllama({ model: 'gemma2:27b' });

  const analizer = new Analyzer({
    dataDir: './data/cert.gov.ua-news',
    llmClient: new LlmClient({
      backend: openAiBackend
    })
  })
  
  analizer.run();
}

main();