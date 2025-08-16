import fs from "fs/promises";
import { existsSync } from "fs";
import { CountryNameNormalizer } from "../CountryNameNormalizer/CountryNameNormalizer";
import { NormalizedData } from "../utils/validationUtils";
import { EmbeddingsClient } from "../EmbeddingsClient/EmbeddingsClient";

interface Params {
  inputDir: string;
  outputDir: string;
  countryNameNormalizer: CountryNameNormalizer;
  embeddingsClient: EmbeddingsClient;
}

export class DataNormalizer {
  #inputDir: string;
  #outputDir: string;
  #countryNameNormalizer: CountryNameNormalizer;
  #embeddingsClient: EmbeddingsClient;

  constructor(params: Params) {
    this.#inputDir = params.inputDir;
    this.#outputDir = params.outputDir;
    this.#countryNameNormalizer = params.countryNameNormalizer;
    this.#embeddingsClient = params.embeddingsClient;
  }

  async run() {
    if (!existsSync(this.#outputDir)) {
      await fs.mkdir(this.#outputDir, { recursive: true });
    }

    const files = await fs.readdir(this.#inputDir);
    for (const file of files) {
      console.log(`IN FILE=${this.#inputDir}/${file}`);
      const content = await fs.readFile(`${this.#inputDir}/${file}`);
      const data = JSON.parse(content.toString()) as NormalizedData;
      const response = await this.#normalizeAndEnrich(data);
      await this.#saveResponse(file, JSON.stringify(response, undefined, 2));
    }
  }

  async #normalizeAndEnrich(
    data: NormalizedData
  ): Promise<NormalizedData | {}> {
    if (!data.countries) return data;

    for (const country of data.countries) {
      if (!country.name) continue;
      const countryCode = await this.#countryNameNormalizer.normalizeCountry(
        country.name
      );
      country.code = countryCode;
    }

    const enrichedAttackTargets: {
      name: string;
      embedding: number[];
    }[] = [];

    for (const target of data.attackTargets) {
      const embedding = await this.#embeddingsClient.embed(target);
      enrichedAttackTargets.push({
        name: target,
        embedding
      });
    }

    data.enrichedAttackTargets = enrichedAttackTargets;

    return data;
  }

  async #saveResponse(originalFile: string, content: string) {
    const rawResultFile = `${this.#outputDir}/${originalFile}`;
    console.log(`OUT FILE=${rawResultFile}`);
    await fs.writeFile(rawResultFile, content);
  }
}
