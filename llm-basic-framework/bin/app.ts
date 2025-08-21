import dotenv from "dotenv";
dotenv.config();

import { DataExtractor } from "../src/DataProcessors/DataExtractor";
import { DataExtractorUnified } from "../src/DataProcessors/DataExtractorUnified";
import { DataNormalizer } from "../src/DataProcessors/DataNormalizer";
import { DataNormalizerUnified } from "../src/DataProcessors/DataNormalizerUnified";
import { DataAnalyzer } from "../src/DataProcessors/DataAnalyzer";
import { DataEntitiesCollector } from "../src/DataProcessors/DataEntitiesCollector";
import { DataEntitiesCollectorUnified } from "../src/DataProcessors/DataEntitiesCollectorUnified";
import { DataGraphBuilder } from "../src/DataProcessors/DataGraphBuilder";
import { LlmClient } from "../src/LlmClient/LlmClient";
import { LlmClientBackendOpenAi } from "../src/LlmClient/LlmClientBackendOpenAi";
import { LlmClientBackendOllama } from "../src/LlmClient/LlmClientBackendOllama";
import { LlmClientBackendVertexAi } from "../src/LlmClient/LlmClientBackendVertexAi";
import { LlmClientBackendAnthropic } from "../src/LlmClient/LlmClientBackendAnthropic";

import { EmbeddingsClient } from "../src/EmbeddingsClient/EmbeddingsClient";
import { EmbeddingsBackendOllama } from "../src/EmbeddingsClient/EmbeddingsBackendOllama";
import { EmbeddingsBackendOpenAi } from "../src/EmbeddingsClient/EmbeddingsBackendOpenAi";
import { EmbeddingsBackendVertexAi } from "../src/EmbeddingsClient/EmbeddingsBackendVertexAi";

import { CountryNameNormalizer } from "../src/CountryNameNormalizer/CountryNameNormalizer";
import { FlowManager } from "../src/FlowManager/FlowManager";

// Configuration from environment or defaults
const CONFIG = {
  // Use 'unified' or 'legacy' format
  format: process.env.FORMAT || 'legacy',
  
  // LLM provider: 'openai', 'ollama', 'vertexai', 'anthropic'
  llmProvider: process.env.LLM_PROVIDER || 'ollama',
  llmModel: process.env.LLM_MODEL || 'gpt-oss:20b',
  
  // Embeddings provider: 'openai', 'ollama', 'vertexai'
  embeddingsProvider: process.env.EMBEDDINGS_PROVIDER || 'ollama',
  embeddingsModel: process.env.EMBEDDINGS_MODEL || 'nomic-embed-text',
  
  // Directories
  inputDir: process.env.INPUT_DIR || '../cert.gov.ua-fetcher/data',
  outputDir: process.env.OUTPUT_DIR || './storage/cert.gov.ua/output',
  
  // What to run
  steps: process.env.STEPS?.split(',') || ['dataExtractor']
};

async function main() {
  // Create LLM client
  const llmClient = createLlmClient();
  const embeddingsClient = createEmbeddingsClient();
  
  // Create processors
  const processors = createProcessors(llmClient, embeddingsClient);
  
  // Build flow
  const availableSteps: Record<string, () => Promise<void>> = {
    dataExtractor: () => processors.dataExtractor.run(),
    dataEntitiesCollector: () => processors.dataEntitiesCollector.run(),
    dataNormalizer: () => processors.dataNormalizer.run(),
    dataAnalyzer: () => processors.dataAnalyzer.run(),
    dataGraphBuilder: () => processors.dataGraphBuilder.run()
  };
  
  const steps = CONFIG.steps.map(stepName => {
    if (!availableSteps[stepName]) {
      throw new Error(`Unknown step: ${stepName}. Available: ${Object.keys(availableSteps).join(', ')}`);
    }
    return {
      name: stepName,
      run: availableSteps[stepName]
    };
  });
  
  const flowManager = new FlowManager({ steps });
  
  // Run
  if (CONFIG.steps.length === 1) {
    await flowManager.runStep(CONFIG.steps[0]);
  } else {
    await flowManager.runAllSteps();
  }
}

function createLlmClient(): LlmClient {
  let backend;
  
  switch (CONFIG.llmProvider) {
    case 'openai':
      backend = new LlmClientBackendOpenAi({
        model: CONFIG.llmModel,
        apiKey: process.env.OPENAI_API_KEY!
      });
      break;
      
    case 'ollama':
      backend = new LlmClientBackendOllama({
        model: CONFIG.llmModel,
        apiKey: process.env.OLLAMA_API_KEY
      });
      break;
      
    case 'vertexai':
      backend = new LlmClientBackendVertexAi({
        model: CONFIG.llmModel,
        project: process.env.VERTEXAI_PROJECT!,
        location: process.env.VERTEXAI_LOCATION!
      });
      break;
      
    case 'anthropic':
      backend = new LlmClientBackendAnthropic({
        model: CONFIG.llmModel,
        apiKey: process.env.ANTHROPIC_API_KEY!
      });
      break;
      
    default:
      throw new Error(`Unknown LLM provider: ${CONFIG.llmProvider}`);
  }
  
  return new LlmClient({ backend });
}

function createEmbeddingsClient(): EmbeddingsClient {
  let backend;
  
  switch (CONFIG.embeddingsProvider) {
    case 'openai':
      backend = new EmbeddingsBackendOpenAi({
        model: CONFIG.embeddingsModel,
        apiKey: process.env.OPENAI_API_KEY!
      });
      break;
      
    case 'ollama':
      backend = new EmbeddingsBackendOllama({
        model: CONFIG.embeddingsModel
      });
      break;
      
    case 'vertexai':
      backend = new EmbeddingsBackendVertexAi({
        model: CONFIG.embeddingsModel,
        project: process.env.VERTEXAI_PROJECT!,
        location: process.env.VERTEXAI_LOCATION!
      });
      break;
      
    default:
      throw new Error(`Unknown embeddings provider: ${CONFIG.embeddingsProvider}`);
  }
  
  return new EmbeddingsClient({ backend });
}

function createProcessors(llmClient: LlmClient, embeddingsClient: EmbeddingsClient) {
  const modelDir = llmClient.modelName.replace(/:/g, "-");
  const baseDir = CONFIG.outputDir;
  const inputDir = CONFIG.inputDir;
  
  const preprocessor = (content: string) => {
    const data = JSON.parse(content);
    return Promise.resolve({
      text: data.text.replace(/<img[^>]*>/gi, ""),
      metadata: {
        date: data.date,
        id: data.id,
        title: data.title
      }
    });
  };
  
  if (CONFIG.format === 'unified') {
    // Unified format
    const suffix = 'unified';
    
    const dataExtractor = new DataExtractorUnified({
      inputDir,
      outputDir: `${baseDir}/raw-${suffix}/${modelDir}`,
      preprocessor,
      llmClient
    });
    
    const dataEntitiesCollector = new DataEntitiesCollectorUnified({
      inputDir: dataExtractor.outputDir,
      outputDir: `${baseDir}/entities-${suffix}/${modelDir}`,
      llmClient
    });
    
    const dataNormalizer = new DataNormalizerUnified({
      inputDir: dataExtractor.outputDir,
      outputDir: `${baseDir}/normalized-${suffix}/${modelDir}`,
      entitiesFile: `${dataEntitiesCollector.outputDir}/entities.json`,
      countryNameNormalizer: new CountryNameNormalizer({ llmClient }),
      embeddingsClient
    });
    
    const dataAnalyzer = new DataAnalyzer({
      inputDir: dataNormalizer.outputDir,
      outputDir: `${baseDir}/analyzed-${suffix}/${modelDir}`
    });
    
    const dataGraphBuilder = new DataGraphBuilder({
      inputDir: dataNormalizer.outputDir,
      outputDir: `${baseDir}/analyzed-${suffix}/${modelDir}`
    });
    
    return { dataExtractor, dataEntitiesCollector, dataNormalizer, dataAnalyzer, dataGraphBuilder };
    
  } else {
    // Legacy format
    const dataExtractor = new DataExtractor({
      inputDir,
      outputDir: `${baseDir}/raw/${modelDir}`,
      preprocessor,
      llmClient
    });
    
    const dataEntitiesCollector = new DataEntitiesCollector({
      inputDir: dataExtractor.outputDir,
      outputDir: `${baseDir}/entities/${modelDir}`,
      llmClient
    });
    
    const dataNormalizer = new DataNormalizer({
      inputDir: dataExtractor.outputDir,
      outputDir: `${baseDir}/normalized/${modelDir}`,
      entitiesFile: `${dataEntitiesCollector.outputDir}/entities.json`,
      countryNameNormalizer: new CountryNameNormalizer({ llmClient }),
      embeddingsClient
    });
    
    const dataAnalyzer = new DataAnalyzer({
      inputDir: dataNormalizer.outputDir,
      outputDir: `${baseDir}/analyzed/${modelDir}`
    });
    
    const dataGraphBuilder = new DataGraphBuilder({
      inputDir: dataNormalizer.outputDir,
      outputDir: `${baseDir}/analyzed/${modelDir}`
    });
    
    return { dataExtractor, dataEntitiesCollector, dataNormalizer, dataAnalyzer, dataGraphBuilder };
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});