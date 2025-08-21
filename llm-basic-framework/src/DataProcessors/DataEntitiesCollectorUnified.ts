import fs from "fs/promises";
import { existsSync } from "fs";
import { jsonrepair } from "jsonrepair";

import type { LlmClient } from "../LlmClient/LlmClient";
import {
  extractAndParseJson,
  normalizeRawData,
  UnifiedData,
  Entity,
  Category
} from "../utils/validationUtilsUnified";

interface Params {
  inputDir: string;
  outputDir: string;
  llmClient: LlmClient;
  maxRetries?: number;
  retryDelay?: number;
}

export class DataEntitiesCollectorUnified {
  public readonly inputDir: string;
  public readonly outputDir: string;
  #llmClient: LlmClient;
  #maxRetries: number;
  #retryDelay: number;

  constructor(params: Params) {
    this.inputDir = params.inputDir;
    this.outputDir = params.outputDir;
    this.#llmClient = params.llmClient;
    this.#maxRetries = params.maxRetries ?? 3;
    this.#retryDelay = params.retryDelay ?? 2000;
  }

  async run() {
    if (!existsSync(this.outputDir)) {
      await fs.mkdir(this.outputDir, { recursive: true });
    }

    const entitiesByCategory = await this.#gatherEntities();
    const normalizedEntities: Record<string, any> = {};

    // Process each category
    for (const [category, entities] of Object.entries(entitiesByCategory)) {
      if (entities.length === 0) continue;
      
      const normalized = await this.#sendToLlm(category, entities);
      
      // Store normalized entities with their category
      for (const [original, normalizedName] of Object.entries(normalized)) {
        const key = `${category}:${original}`;
        normalizedEntities[key] = {
          category,
          normalizedName
        };
      }
    }

    await this.#saveResponse({ entities: normalizedEntities });
  }

  async #gatherEntities() {
    const files = await fs.readdir(this.inputDir);

    const entitiesByCategory: Record<Category, string[]> = {
      'Organization': [],
      'HackerGroup': [],
      'Software': [],
      'Country': [],
      'Individual': [],
      'Domain': [],
      'Sector': [],
      'Government Body': [],
      'Infrastructure': [],
      'Device': []
    };

    for (const file of files) {
      const data = await fs.readFile(`${this.inputDir}/${file}`);
      const content = JSON.parse(data.toString()) as UnifiedData;

      if (!content.entities) continue;

      for (const entity of content.entities) {
        if (entity.name && !entitiesByCategory[entity.category].includes(entity.name)) {
          entitiesByCategory[entity.category].push(entity.name);
        }
      }
    }

    return entitiesByCategory;
  }

  async #sendToLlm(
    entityType: string,
    entities: string[]
  ): Promise<Record<string, string>> {
    const uniqueEntities = [...new Set(entities)];

    const instructions = `
      You are a data normalization expert. Your task is to normalize the following list of ${entityType} entities.
      Group similar entities together and provide a single normalized name for each group.
      
      For example:
      - "Microsoft Corp", "Microsoft Corporation", "MSFT" should all map to "Microsoft Corporation"
      - "APT28", "Fancy Bear", "Sofacy Group" should all map to "APT28"
      
      Return a JSON object where each key is the original entity name and the value is the normalized name.
      If an entity doesn't need normalization, map it to itself.
      
      Entities to normalize:
      ${JSON.stringify(uniqueEntities, null, 2)}
      
      Return ONLY a JSON object in this format:
      {
        "original_name_1": "normalized_name_1",
        "original_name_2": "normalized_name_2"
      }
    `;

    let attempts = 0;
    while (attempts < this.#maxRetries) {
      try {
        console.time(`LLM NORMALIZATION - ${entityType}`);
        const result = await this.#llmClient.send(instructions, "");
        console.timeEnd(`LLM NORMALIZATION - ${entityType}`);

        const parsed = extractAndParseJson(result);
        if (parsed) {
          // Ensure all entities have a mapping
          const normalized: Record<string, string> = {};
          for (const entity of uniqueEntities) {
            normalized[entity] = parsed[entity] || entity;
          }
          return normalized;
        }
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed for ${entityType}:`, error);
        attempts++;
        if (attempts < this.#maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.#retryDelay));
        }
      }
    }

    // Fallback: map each entity to itself
    const fallback: Record<string, string> = {};
    for (const entity of uniqueEntities) {
      fallback[entity] = entity;
    }
    return fallback;
  }

  async #saveResponse(data: any) {
    const entitiesFile = `${this.outputDir}/entities.json`;
    console.log(`OUT FILE=${entitiesFile}`);
    await fs.writeFile(entitiesFile, JSON.stringify(data, undefined, 2));
  }
}