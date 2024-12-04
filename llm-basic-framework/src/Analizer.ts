import fs from 'fs/promises';
import type { LlmClient } from './LlmClient/LlmClient';

interface AnalyzerParams {
  dataDir: string;
  outputDir: string;
  llmClient: LlmClient
}

export class Analyzer {
  #dataDir: string;
  #outputDir: string;
  #llmClient: LlmClient;

  constructor(params: AnalyzerParams) {
    this.#dataDir = params.dataDir;
    this.#outputDir = params.outputDir;
    this.#llmClient = params.llmClient;
  }

  async run() {
    const files = await fs.readdir(this.#dataDir);
    for (const file of files) {
      // const file = '11.txt';
      const content = await fs.readFile(`${this.#dataDir}/${file}`);
      const response = await this.#sendToLlm(content.toString())
      await this.#saveResponse(file, response);
      // break;
    }
  }

  async #sendToLlm(text: string) {
    const instructions = `
      You are a highly skilled data extraction expert specializing in identifying and extracting 
      sensitive information from text. Your task is to analyze the provided text and extract any data that 
      falls under the specified sensitive categories. Text is about cyber incidents.  
      Sensitive data includes: 
      1. Attack Targets: Names of attack targets (e.g., infrastructure objects, enterprises, government institutions).
      2. Hacker Groups: Names of groups or associations that may be involved in the attack.
      3. Applications: Names of software or applications used in the attack.
      4. Countries: Countries related to the events. Indicate whether they are related to the target or the attacker or neutral.
      5. Organizations: Organizations related to the events. Indicate whether they are related to the target or the attacker or neutral. 
      6. Individuals: Names of individuals related to the incident. Indicate whether they are related to the target or the attacker or neutral.
      7. Domains: Internet domain names related to the incident. Indicate whether they are controlled by the target or the attacker or neutral.

      Please return the extracted information in the exact JSON format specified below and nothing else: 
     {
      "attackTargets": ["Attack Target 1", "Attack Target 2"],
      "hackerGroups": ["Hacker Group 1", "Hacker Group 2"],
      "applications": ["Software or Application 1", "Software or Application 2"],
      "countries": [
        {"name": "Country 1", "relation": "target"},
        {"name": "Country 2", "relation": "attacker"},
        {"name": "Country 3", "relation": "neutral"}
      ],
      "organizations": [
        {"name": "Organization 1", "relation": "target"},
        {"name": "Organization 2", "relation": "attacker"},
        {"name": "Organization 3", "relation": "neutral"}
      ],
      "individuals": [
        {"name": "Individual 1", "relation": "target"},
        {"name": "Individual 2", "relation": "attacker"},
        {"name": "Individual 3", "relation": "neutral"}
      ],
      "domains": [
        {"name": "domain1", "relation": "target"},
        {"name": "domain2", "relation": "attacker"},
        {"name": "domain2", "relation": "neutral"}
      ]
    }
    
    - Categories "attackTargets", "hackerGroups", "applications" should contain array of strings
    - Categories "countries", "organizations", "individuals", "domains" should contain objects with "name" and "relation" properties.
    - If there are no mentions for a category, return an empty array for that category. 
    - Do not include any additional text or explanation.
    - Do not return info about CERT-UA 

    Start extracting information:
    `
    console.time('LLM PROCESSING');
    const result = await this.#llmClient.send(
      instructions,
      text
    );
    console.timeEnd('LLM PROCESSING');

    return result;
  }

  async #saveResponse(originalFile: string, text: string) {
    const rawResultFile = `${this.#outputDir}/${originalFile}.response`;
    await fs.writeFile(rawResultFile, text);
  }
}