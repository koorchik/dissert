import dotenv from "dotenv";
dotenv.config();

import { DataExtractor } from "../src/DataProcessors/DataExtractor";
import { DataNormalizer } from "../src/DataProcessors/DataNormalizer";
import { DataAnalyzer } from "../src/DataProcessors/DataAnalyzer";
import { DataEntitiesCollector } from "../src/DataProcessors/DataEntitiesCollector";
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

async function main() {
  const llmClient = makeLlmClient();
  const embeddingsClient = makeEmbeddingsClient();

  const dataExtractor = new DataExtractor({
    inputDir: "../cert.gov.ua-fetcher/data",
    outputDir: `./storage/cert.gov.ua/output/raw/${llmClient.modelName.replace(
      /:/g,
      "-"
    )}`,
    preprocessor: (content: string) => {
      const data = JSON.parse(content);

      return Promise.resolve({
        text: data.text.replace(/<img[^>]*>/gi, ""),
        metadata: {
          date: data.date,
          id: data.id,
          title: data.title
        }
      });
    },
    llmClient
  });

  const dataEntitiesCollector = new DataEntitiesCollector({
    inputDir: `./storage/cert.gov.ua/output/raw/${llmClient.modelName.replace(
      /:/g,
      "-"
    )}`,
    outputDir: `./storage/cert.gov.ua/output/entities/${llmClient.modelName.replace(
      /:/g,
      "-"
    )}`,
    llmClient
  });

  const dataNormalizer = new DataNormalizer({
    inputDir: `./storage/output/raw/${llmClient.modelName.replace(/:/g, "-")}`,
    outputDir: `./storage/output/normalized/${llmClient.modelName.replace(
      /:/g,
      "-"
    )}`,
    countryNameNormalizer: new CountryNameNormalizer({ llmClient }),
    embeddingsClient
  });

  const dataAnalyzer = new DataAnalyzer({
    inputDir: `./storage/output/normalized/${llmClient.modelName.replace(
      /:/g,
      "-"
    )}`,
    outputDir: `./storage/output/analyzed/${llmClient.modelName.replace(
      /:/g,
      "-"
    )}`
  });

  const flowManager = new FlowManager({
    steps: [
      {
        name: "dataExtractor",
        run: () => dataExtractor.run()
      },
      {
        name: "dataEntitiesCollector",
        run: async () => dataEntitiesCollector.run()
      },
      {
        name: "dataNormalizer",
        run: async () => dataNormalizer.run()
      },
      {
        name: "dataAnalyzer",
        run: async () => dataAnalyzer.run()
      }
      // {
      //   name: 'normalizer',
      //   run: async () => {
      //     // console.log('normalized', await normalizer.normalizeCountry('Україна'));
      //     // console.log('normalized', await normalizer.normalizeAttackTarget('оборонним відомствам інших країни світу'));
      //     const embedding = await embeddingsClient.embed("оборонним відомствам інших країни світу");
      //     console.log(embedding);
      //   }
      // }
    ]
  });

  await flowManager.runStep("dataEntitiesCollector");
  //  flowManager.runAllSteps();
}

main();

function makeLlmClient() {
  const openAiApiKey = process.env["OPENAI_API_KEY"];
  if (!openAiApiKey) throw new Error("OPENAI_API_KEY env required");

  const vertexAiProject = process.env["VERTEXAI_PROJECT"];
  if (!vertexAiProject) throw new Error("VERTEXAI_PROJECT env required");

  const vertexAiLocation = process.env["VERTEXAI_LOCATION"];
  if (!vertexAiLocation) throw new Error("VERTEXAI_LOCATION env required");

  const antrophicApiKey = process.env["ANTHROPIC_API_KEY"];
  if (!antrophicApiKey) throw new Error("ANTHROPIC_API_KEY env required");

  const ollamaApiKey = process.env["OLLAMA_API_KEY"];

  // OpenAi models:
  // gpt-4o
  // gpt-4o-mini
  // o1-preview - slow, expensive, for reasoning.
  // o1-mini - slow, expensive, for reasoning.
  // gpt-5 (25 sec per message)
  // gpt-5-mini (25 sec per message)
  // gpt-5-nano (25 sec per message)
  const openAiBackend = new LlmClientBackendOpenAi({
    model: "gpt-5-mini",
    apiKey: openAiApiKey
  });

  // Ollama models:
  // llama3.1:70b - 24GB GPU (52% of model, 1-2 min per message).
  // llama3.1:8b - 8GB GPU (100% of model).
  // llama3.2:3b - 8GB GPU (100% of model)
  // deepseek-r1:8b - 8GB GPU (100% of model, 15-25 seconds per message because of reasoning)
  // deepseek-r1:7b - 8GB GPU (100% of model, 15-25 seconds per message because of reasoning)
  // deepseek-r1:1.5b - does not work at all (possibly Ukrainian language is not handled correctly in inputs)
  // gemma2:27b - 8GB GPU (36% of model, 1-2 min per message), 24GB GPU (100% of model, 2-5 sec per message),
  // gemma2:9b - 8GB GPU (84% of model).
  // llama3.2:1b - 8GB GPU (100% of model). Unusable: hallucinates individuals heavily.
  // mistral:7b - 8GB GPU (100% of model).  Unusable: does not follow JSON structure.
  // phi3:3.8b - 8GB GPU (100% of model). Unusable: generates a lot of noise, incorrect classification, etc.
  // phi3:14b - 8GB GPU (74% of model). Low quality. TODO: check more.
  // gemma3:270m - Unusable: cannot extract any data
  // gemma3:27b 24GB GPU (100% of model, 4-8 seconds per message).
  // gemma3:4b 24GB GPU (100% of model, 2-4 seconds per message).
  // gemma3:1b Unusable: copies some data from example
  // gpt-oss:120b
  // gpt-oss:20b

  const ollamaBackend = new LlmClientBackendOllama({
    model: "gpt-oss:20b",
    apiKey: ollamaApiKey
  });

  // VertexAi models:
  // gemini-1.5-flash-002
  // gemini-1.5-pro-002
  // gemini-flash-experimental
  const vertexAiBackend = new LlmClientBackendVertexAi({
    model: "gemini-flash-experimental",
    project: vertexAiProject,
    location: vertexAiLocation
  });

  // Anthropic models:
  // claude-3-5-sonnet-20241022
  // claude-3-5-haiku-20241022
  const anthropicBackend = new LlmClientBackendAnthropic({
    model: "claude-3-5-haiku-20241022",
    apiKey: antrophicApiKey
  });

  return new LlmClient({ backend: ollamaBackend });
}

function makeEmbeddingsClient() {
  const openAiApiKey = process.env["OPENAI_API_KEY"];
  if (!openAiApiKey) throw new Error("OPENAI_API_KEY env required");

  const vertexAiProject = process.env["VERTEXAI_PROJECT"];
  if (!vertexAiProject) throw new Error("VERTEXAI_PROJECT env required");

  const vertexAiLocation = process.env["VERTEXAI_LOCATION"];
  if (!vertexAiLocation) throw new Error("VERTEXAI_LOCATION env required");

  // OpenAi models:
  // text-embedding-3-small
  const openAiBackend = new EmbeddingsBackendOpenAi({
    model: "text-embedding-3-small",
    apiKey: openAiApiKey
  });

  // Ollama models:
  // nomic-embed-text
  const ollamaBackend = new EmbeddingsBackendOllama({
    model: "nomic-embed-text"
  });

  // VertexAi models:
  // textembedding-gecko-multilingual@001
  const vertexAiBackend = new EmbeddingsBackendVertexAi({
    model: "textembedding-gecko-multilingual@001",
    project: vertexAiProject,
    location: vertexAiLocation
  });

  return new EmbeddingsClient({ backend: ollamaBackend });
}
