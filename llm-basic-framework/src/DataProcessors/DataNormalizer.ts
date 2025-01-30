import fs from 'fs/promises';
import {existsSync} from 'fs';
import { CountryNameNormalizer } from '../CountryNameNormalizer/CountryNameNormalizer';
import { NormalizedData } from '../utils/validationUtils';

interface Params {
  inputDir: string;
  outputDir: string;
  countryNameNormalizer: CountryNameNormalizer
}

export class DataNormalizer {
  #inputDir: string;
  #outputDir: string;
  #countryNameNormalizer: CountryNameNormalizer;

  constructor(params: Params) {
    this.#inputDir = params.inputDir;
    this.#outputDir = params.outputDir;
    this.#countryNameNormalizer = params.countryNameNormalizer;
  }

  async run() {
    if (!existsSync(this.#outputDir)) {
      await fs.mkdir(this.#outputDir, { recursive: true });
    }

    const files = await fs.readdir(this.#inputDir);
    for (const file of files) {
      console.log(`FILE=${file}`);
      const content = await fs.readFile(`${this.#inputDir}/${file}`);
      const data = JSON.parse(content.toString()) as NormalizedData;
      const response = await this.#normalizeAndEnrich(data);
      await this.#saveResponse(file, JSON.stringify(response, undefined, 2));
    }
  }

  async #normalizeAndEnrich(data: NormalizedData): Promise<any | {}> {
    if (!data.countries) return data;
    
    for (const country of data.countries) {
      if (!country.name) continue;
      const countryCode = await this.#countryNameNormalizer.normalizeCountry(country.name);
      console.log(country.name, countryCode);
    }
    return data;
  }

  async #saveResponse(originalFile: string, text: string) {
    const rawResultFile = `${this.#outputDir}/${originalFile}`;
    await fs.writeFile(rawResultFile, text);
  }
}