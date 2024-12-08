import RJSON from 'relaxed-json';
import LIVR from 'livr';
LIVR.Validator.defaultAutoTrim(true);

const validator = new LIVR.Validator({
  attackTargets: [{ default: [[]] }, { listOf: ['string', 'toLc'] }],
  hackerGroups: [{ default: [[]] }, { listOf: ['string', 'toLc'] }],
  applications: [{ default: [[]] }, { listOf: ['string', 'toLc'] }],
  countries: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['required', 'string', 'toLc'],
      relation: ['required', 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
  organizations: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['required', 'string', 'toLc'],
      relation: ['required', 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
  individuals: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['required', 'string', 'toLc'],
      relation: ['required', 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
  domains: [{ default: [[]] }, {
    listOfObjects: [{
      name: ['required', 'string', 'toLc'],
      relation: ['required', 'string', { oneOf: ['attacker', 'neutral', 'target'] }]
    }]
  }],
});

interface RawData {
  [key: string]: string
};

type Relation = 'attacker' | 'target' | 'neutral';

export interface NormalizedData {
  attackTargets: string[];
  hackerGroups: string[];
  applications: [];
  countries: Array<{
    name: string;
    relation: Relation
  }>;
  organizations: Array<{
    name: string;
    relation: Relation
  }>;
  individuals: Array<{
    name: string;
    relation: Relation
  }>;
  domains: Array<{
    name: string;
    relation: Relation
  }>;
}

export function extractAndParseJson(text: string): RawData | undefined {
  const matched = text.match(/\{[\s\S]+\}/g);
  if (!matched) return;

  try {
    return RJSON.parse(matched[0]);
  } catch (error) {
    return;
  }
}



export function normalizeRawData(data: { [key: string]: string }): NormalizedData | undefined {
  const validData = validator.validate(data);
  if (!validData) {
    return;
  }

  return validData as NormalizedData;
}
