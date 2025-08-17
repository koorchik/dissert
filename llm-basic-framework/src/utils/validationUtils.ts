import { jsonrepair } from 'jsonrepair'

import LIVR from 'livr';
LIVR.Validator.defaultAutoTrim(true);

const validator = new LIVR.Validator({
  attackTargets: [{ default: [[]] }, { listOf: ['string'] }],
  hackerGroups: [{ default: [[]] }, { listOf: ['string'] }],
  applications: [{ default: [[]] }, { listOf: ['string'] }],
  countries: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['required', 'string'],
      relation: ['required', 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
  organizations: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['string'],
      relation: [{ default: 'neutral' }, 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
  individuals: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['string'],
      relation: [{ default: 'neutral' }, 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
  domains: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['string', 'toLc'],
      relation: [{ default: 'neutral' }, 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
});

interface RawData {
  [key: string]: string
};

export type Relation = 'attacker' | 'target' | 'neutral';

export interface NormalizedData {
  attackTargets: string[];
  enrichedAttackTargets?: Array<{
    name: string;
    embedding: number[]
  }>;
  hackerGroups: string[];
  normalizedHackerGroups?: string[];
  applications: [];
  normalizedApplications?: string[];
  countries: Array<{
    name: string;
    relation: Relation;
    code?: string; // Quick fix for the country code
  }>;
  organizations: Array<{
    name: string;
    relation: Relation
  }>;
  normalizedOrganizations?: Array<{
    name: string;
    relation: Relation
  }>;
  individuals: Array<{
    name: string;
    relation: Relation
  }>;
  normalizedIndividuals?: Array<{
    name: string;
    relation: Relation
  }>;
  domains: Array<{
    name: string;
    relation: Relation
  }>;
  normalizedDomains?: Array<{
    name: string;
    relation: Relation
  }>;
}

export function extractAndParseJson(text: string): RawData | undefined {
  const matched = text.match(/\{[\s\S]+\}/g);
  if (!matched) return;

  try {
    const repaired = jsonrepair(matched[0]);
    return JSON.parse(repaired);
  } catch (error) {
    return;
  }
}

export function normalizeRawData(data: { [key: string]: string }): NormalizedData | undefined {
  const validData = validator.validate(data);
  console.log(data);
  if (!validData) {
    console.log({ERROR: validator.getErrors()});
    return;
  }

  validData.individuals = validData.individuals.filter((item: {name: string}) => item.name);
  validData.countries = validData.countries.filter((item: {name: string}) => item.name);
  validData.domains = validData.domains.filter((item: {name: string}) => item.name);
  validData.organizations = validData.organizations.filter((item: {name: string}) => item.name);

  return validData as NormalizedData;
}
