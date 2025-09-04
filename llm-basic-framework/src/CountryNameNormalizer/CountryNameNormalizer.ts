import type { LlmClient } from '../LlmClient/LlmClient';
import { extractAndParseJson } from '../utils/validationUtils';
import { getCountryCode, countries } from 'countries-list';

interface Params {
  llmClient: LlmClient;
}

export class CountryNameNormalizer {
  #llmClient: LlmClient;

  constructor(params: Params) {
    this.#llmClient = params.llmClient;
  }

  async normalizeCountry(country: string) {
    const countryCode = getCountryCode(country);
    if (countryCode) return countryCode;

    const instructions = `
      You should normalize country name to country code from the following list:
      ${Object.keys(countries).join(', ')}
      Please return the extracted information in the exact JSON format specified below and nothing else: 
      { "normalized": "CODE" }
    `;

    const text = await this.#llmClient.send(instructions, country);
    const data = extractAndParseJson(text);
    return data?.normalized;
  }
}
