import fs from "fs/promises";
import { existsSync } from "fs";
import { CountryNameNormalizer } from "../CountryNameNormalizer/CountryNameNormalizer";
import { NormalizedData, Relation } from "../utils/validationUtils";
import { EmbeddingsClient } from "../EmbeddingsClient/EmbeddingsClient";

interface Params {
  inputDir: string;
  outputDir: string;
  countryNameNormalizer: CountryNameNormalizer;
  embeddingsClient: EmbeddingsClient;
  entitiesFile: string;
}

interface Entities {
  attackTargets: Record<string, string>;
  hackerGroups: Record<string, string>;
  applications: Record<string, string>;
  organizations: Record<string, string>;
  individuals: Record<string, string>;
  domains: Record<string, string>;
}

export class DataNormalizer {
  public readonly inputDir: string;
  public readonly outputDir: string;
  #countryNameNormalizer: CountryNameNormalizer;
  #embeddingsClient: EmbeddingsClient;
  #entitesFile: string;

  constructor(params: Params) {
    this.inputDir = params.inputDir;
    this.outputDir = params.outputDir;
    this.#countryNameNormalizer = params.countryNameNormalizer;
    this.#embeddingsClient = params.embeddingsClient;
    this.#entitesFile = params.entitiesFile;
  }

  async run() {
    const data = await fs.readFile(this.#entitesFile);
    const entities = JSON.parse(data.toString()) as Entities;

    console.log(entities);

    if (!existsSync(this.outputDir)) {
      await fs.mkdir(this.outputDir, { recursive: true });
    }

    const files = await fs.readdir(this.inputDir);
    for (const file of files) {
      console.log(`IN FILE=${this.inputDir}/${file}`);
      const content = await fs.readFile(`${this.inputDir}/${file}`);
      const data = JSON.parse(content.toString()) as NormalizedData;
      const response = await this.#normalizeAndEnrich(data, entities);
      await this.#saveResponse(file, JSON.stringify(response, undefined, 2));
    }
  }

  async #normalizeAndEnrich(
    data: NormalizedData,
    entities: Entities
  ): Promise<NormalizedData | {}> {
    await this.#normalizeCountries(data);
    await this.#normalizeAttackTargets(data, entities);
    await this.#normalizeHackerGroups(data, entities);
    await this.#normalizeApplications(data, entities);
    await this.#normalizeOrganizations(data, entities);
    await this.#normalizeIndividuals(data, entities);
    await this.#normalizeDomains(data, entities);

    return data;
  }

  async #normalizeCountries(data: NormalizedData): Promise<void> {
    if (!data.countries) return;

    for (const country of data.countries) {
      if (!country.name) continue;
      const countryCode = await this.#countryNameNormalizer.normalizeCountry(
        country.name
      );
      country.code = countryCode;
    }
  }

  async #normalizeAttackTargets(
    data: NormalizedData,
    entities: Entities
  ): Promise<void> {
    const enrichedAttackTargets: {
      name: string;
      embedding: number[];
    }[] = [];
    const lookupTable = this.#makeLookupTable(entities.attackTargets);

    for (const target of data.attackTargets) {
      enrichedAttackTargets.push({
        name: this.#doLookup(lookupTable, target) || target, // TODO fallback should be done via LLM
        embedding: [] //await this.#embeddingsClient.embed(target)
      });
    }

    data.enrichedAttackTargets = enrichedAttackTargets;
  }

  async #normalizeHackerGroups(
    data: NormalizedData,
    entities: Entities
  ): Promise<void> {
    const normalizedHackerGroups: string[] = [];

    const lookupTable = this.#makeLookupTable(entities.hackerGroups);

    for (const group of data.hackerGroups) {
      normalizedHackerGroups.push(this.#doLookup(lookupTable, group) || group);
    }

    data.normalizedHackerGroups = normalizedHackerGroups;
  }

  async #normalizeApplications(
    data: NormalizedData,
    entities: Entities
  ): Promise<void> {
    const normalizedApplications: string[] = [];

    const lookupTable = this.#makeLookupTable(entities.applications);

    for (const app of data.applications) {
      normalizedApplications.push(this.#doLookup(lookupTable, app) || app);
    }

    data.normalizedApplications = normalizedApplications;
  }

  async #normalizeOrganizations(
    data: NormalizedData,
    entities: Entities
  ): Promise<void> {
    if (!data.organizations) return;

    const normalizedOrganizations: Array<{
      name: string;
      relation: Relation;
    }> = [];

    const lookupTable = this.#makeLookupTable(entities.organizations);

    for (const org of data.organizations) {
      normalizedOrganizations.push({
        name: this.#doLookup(lookupTable, org.name) || org.name,
        relation: org.relation
      });
    }

    data.normalizedOrganizations = normalizedOrganizations;
  }

  async #normalizeIndividuals(
    data: NormalizedData,
    entities: Entities
  ): Promise<void> {
    if (!data.individuals) return;

    const normalizedIndividuals: Array<{
      name: string;
      relation: Relation;
    }> = [];

    const lookupTable = this.#makeLookupTable(entities.individuals);

    for (const individual of data.individuals) {
      normalizedIndividuals.push({
        name: this.#doLookup(lookupTable, individual.name) || individual.name,
        relation: individual.relation
      });
    }

    data.normalizedIndividuals = normalizedIndividuals;
  }

  async #normalizeDomains(
    data: NormalizedData,
    entities: Entities
  ): Promise<void> {
    if (!data.domains) return;

    const normalizedDomains: Array<{
      name: string;
      relation: Relation;
    }> = [];

    const lookupTable = this.#makeLookupTable(entities.domains);

    for (const domain of data.domains) {
      normalizedDomains.push({
        name: this.#doLookup(lookupTable, domain.name) || domain.name,
        relation: domain.relation
      });
    }

    data.normalizedDomains = normalizedDomains;
  }

  async #saveResponse(originalFile: string, content: string) {
    const rawResultFile = `${this.outputDir}/${originalFile}`;
    console.log(`OUT FILE=${rawResultFile}`);
    await fs.writeFile(rawResultFile, content);
  }

  #makeLookupTable(object: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(object).map(([key, value]) => [
        this.#makeLookupKey(key),
        value
      ])
    );
  }

  #makeLookupKey(key: string): string {
    return key.toLowerCase();
  }

  #doLookup(table: Record<string, string>, key: string) {
    return table[this.#makeLookupKey(key)];
  }
}
