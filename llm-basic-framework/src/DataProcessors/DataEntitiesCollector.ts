import fs from "fs/promises";
import { existsSync } from "fs";
import { jsonrepair } from "jsonrepair";

import type { LlmClient } from "../LlmClient/LlmClient";
import {
  extractAndParseJson,
  normalizeRawData,
  NormalizedData
} from "../utils/validationUtils";

interface Params {
  inputDir: string;
  outputDir: string;
  llmClient: LlmClient;
  maxRetries?: number;
  retryDelay?: number;
}

export class DataEntitiesCollector {
  #inputDir: string;
  #outputDir: string;
  #llmClient: LlmClient;
  #maxRetries: number;
  #retryDelay: number;

  constructor(params: Params) {
    this.#inputDir = params.inputDir;
    this.#outputDir = params.outputDir;
    this.#llmClient = params.llmClient;
    this.#maxRetries = params.maxRetries ?? 3;
    this.#retryDelay = params.retryDelay ?? 2000;
  }

  async run() {
    if (!existsSync(this.#outputDir)) {
      await fs.mkdir(this.#outputDir, { recursive: true });
    }

    const entities = await this.#gatherEntities();

    const attackTargets = await this.#sendToLlm(
      "Attack targets",
      entities.attackTargets
    );
    await this.#saveResponse({ attackTargets });

    const hackerGroups = await this.#sendToLlm(
      "Hacker groups",
      entities.hackerGroups
    );
    await this.#saveResponse({ hackerGroups });

    const applications = await this.#sendToLlm(
      "Applications",
      entities.applications
    );
    await this.#saveResponse({ applications });

    const organizations = await this.#sendToLlm(
      "Organizations",
      entities.organizations
    );
    await this.#saveResponse({ organizations });

    const individuals = await this.#sendToLlm(
      "Individuals",
      entities.individuals
    );
    await this.#saveResponse({ individuals });

    const domains = await this.#sendToLlm("Web domain", entities.domains);
    await this.#saveResponse({ domains });
  }

  async #gatherEntities() {
    const files = await fs.readdir(this.#inputDir);

    const entities = {
      attackTargets: [] as string[],
      hackerGroups: [] as string[],
      applications: [] as string[],
      organizations: [] as string[],
      individuals: [] as string[],
      domains: [] as string[]
    };

    for (const file of files) {
      const data = await fs.readFile(`${this.#inputDir}/${file}`);
      const content = JSON.parse(data.toString()) as NormalizedData;

      entities.attackTargets.push(...content.attackTargets);
      entities.hackerGroups.push(...content.hackerGroups);
      entities.applications.push(...content.applications);
      entities.organizations.push(
        ...content.organizations.map((org) => org.name)
      );
      entities.individuals.push(
        ...content.individuals.map((individual) => individual.name)
      );
      entities.domains.push(...content.domains.map((domain) => domain.name));
    }

    return entities;
  }

  async #sendToLlm(
    entityName: string,
    items: string[]
  ): Promise<Record<string, string>> {
    const uniqueInputItems = [...new Set(items)];
    const text = JSON.stringify(uniqueInputItems, undefined, 2);

    const instructions = `
      You are text normalization expert. Your goal is to normalize names of ${entityName}, so it can be used to for clustering later. As input you get a list of names.
      Your goal:
      1. Find the same entities or entities that can be considered the same.
      2. Unify and merge such entities into single entity.
      3. Create mappings between original name as key and new name as value

      Return the final data in exact JSON format specified below and nothing else: 
      {
        "Original Name1", "Normalized Name",
        "Original Name1 similar", "Normalized Name",
        "Original Name2", "Normalized Name2",
      }
      
      Start normalizing list:
    `;

    let lastError: Error | null = null;
    let lastResult;

    for (let attempt = 1; attempt <= this.#maxRetries; attempt++) {
      try {
        console.time(`LLM PROCESSING ${entityName} (attempt ${attempt})`);
        lastResult = await this.#llmClient.send(instructions, text);
        console.timeEnd(`LLM PROCESSING ${entityName} (attempt ${attempt})`);

        const repaired = jsonrepair(lastResult);
        const unifiedList = JSON.parse(repaired) as Record<string, string>;

        if (!unifiedList) return {};

        // Validate and add missing items
        const missingItems: string[] = [];
        for (const item of uniqueInputItems) {
          if (!(item in unifiedList)) {
            missingItems.push(item);
            unifiedList[item] = item; // Identity mapping for missing items
          }
        }

        if (missingItems.length > 0) {
          console.warn(
            `⚠️  Missing ${missingItems.length} items in LLM response for ${entityName}. Added with identity mapping.`
          );
          console.warn(
            `   Missing items: ${missingItems.slice(0, 5).join(", ")}${
              missingItems.length > 5 ? "..." : ""
            }`
          );
        }

        // Calculate and print statistics
        const uniqueOutputValues = new Set(Object.values(unifiedList));
        console.log(`✅ ${entityName} normalization complete:`);
        console.log(`   Input: ${uniqueInputItems.length} unique entities`);
        console.log(
          `   Output: ${uniqueOutputValues.size} unique normalized entities`
        );
        console.log(
          `   Reduction: ${(
            (1 - uniqueOutputValues.size / uniqueInputItems.length) *
            100
          ).toFixed(1)}%`
        );

        return unifiedList;
      } catch (error) {
        lastError = error as Error;
        console.log({ lastResult });

        console.error(
          `Failed to parse LLM response for ${entityName} (attempt ${attempt}/${
            this.#maxRetries
          }):`,
          error
        );

        if (attempt < this.#maxRetries) {
          console.log(`Retrying in ${this.#retryDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, this.#retryDelay));
        }
      }
    }

    console.error(
      `All retry attempts failed for ${entityName}. Returning identity mappings.`
    );
    console.error(`Last error:`, lastError);

    // Return identity mappings if all attempts fail
    const identityMappings: Record<string, string> = {};
    for (const item of uniqueInputItems) {
      identityMappings[item] = item;
    }
    return identityMappings;
  }

  async #readExistingEntities(): Promise<any> {
    const file = `${this.#outputDir}/entities.json`;

    if (!existsSync(file)) {
      return {
        attackTargets: {},
        hackerGroups: {},
        applications: {},
        organizations: {},
        individuals: {},
        domains: {}
      };
    }

    try {
      const content = await fs.readFile(file, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error reading existing entities file:`, error);
      return {
        attackTargets: {},
        hackerGroups: {},
        applications: {},
        organizations: {},
        individuals: {},
        domains: {}
      };
    }
  }

  async #saveResponse(newData: any) {
    const file = `${this.#outputDir}/entities.json`;

    const existingData = await this.#readExistingEntities();

    const mergedData = {
      ...existingData,
      ...newData
    };

    const text = JSON.stringify(mergedData, undefined, 2);
    console.log(`Updating file: ${file}`);
    await fs.writeFile(file, text);
  }
}
