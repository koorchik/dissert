import fs from "fs/promises";
import { existsSync } from "fs";
import { CountryNameNormalizer } from "../CountryNameNormalizer/CountryNameNormalizer";
import { UnifiedData, Entity } from "../utils/validationUtilsUnified";
import { EmbeddingsClient } from "../EmbeddingsClient/EmbeddingsClient";

interface Params {
  inputDir: string;
  outputDir: string;
  countryNameNormalizer: CountryNameNormalizer;
  embeddingsClient: EmbeddingsClient;
  entitiesFile: string;
}

interface UnifiedEntities {
  entities: Record<string, {
    category: string;
    normalizedName: string;
  }>;
}

export class DataNormalizerUnified {
  public readonly inputDir: string;
  public readonly outputDir: string;
  #countryNameNormalizer: CountryNameNormalizer;
  #embeddingsClient: EmbeddingsClient;
  #entitiesFile: string;

  constructor(params: Params) {
    this.inputDir = params.inputDir;
    this.outputDir = params.outputDir;
    this.#countryNameNormalizer = params.countryNameNormalizer;
    this.#embeddingsClient = params.embeddingsClient;
    this.#entitiesFile = params.entitiesFile;
  }

  async run() {
    const data = await fs.readFile(this.#entitiesFile);
    const entities = JSON.parse(data.toString()) as UnifiedEntities;

    console.log(entities);

    if (!existsSync(this.outputDir)) {
      await fs.mkdir(this.outputDir, { recursive: true });
    }

    const files = await fs.readdir(this.inputDir);
    for (const file of files) {
      console.log(`IN FILE=${this.inputDir}/${file}`);
      const content = await fs.readFile(`${this.inputDir}/${file}`);
      const data = JSON.parse(content.toString()) as UnifiedData;
      const response = await this.#normalizeAndEnrich(data, entities);
      await this.#saveResponse(file, JSON.stringify(response, undefined, 2));
    }
  }

  async #normalizeAndEnrich(
    data: UnifiedData,
    entities: UnifiedEntities
  ): Promise<UnifiedData> {
    if (!data.entities) return data;

    for (const entity of data.entities) {
      // Normalize countries
      if (entity.category === 'Country') {
        const countryCode = await this.#countryNameNormalizer.normalizeCountry(
          entity.name
        );
        entity.code = countryCode;
      }

      // Look up normalized names from entities file
      const key = `${entity.category}:${entity.name}`;
      if (entities.entities && entities.entities[key]) {
        entity.normalizedName = entities.entities[key].normalizedName;
      } else {
        entity.normalizedName = entity.name;
      }

      // Generate embeddings for certain categories
      if (['Infrastructure', 'Sector', 'Device'].includes(entity.category) && 
          entity.role === 'Target') {
        // Uncomment when ready to generate embeddings
        // entity.embedding = await this.#embeddingsClient.embed(entity.name);
        entity.embedding = [];
      }
    }

    return data;
  }

  async #saveResponse(originalFile: string, text: string) {
    const resultFile = `${this.outputDir}/${originalFile}`;
    console.log(`OUT FILE=${resultFile}`);
    await fs.writeFile(resultFile, text);
  }
}