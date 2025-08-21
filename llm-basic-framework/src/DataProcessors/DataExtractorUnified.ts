import fs from "fs/promises";
import { existsSync } from "fs";
import type { LlmClient } from "../LlmClient/LlmClient";
import {
  extractAndParseJson,
  normalizeRawData,
  NormalizedData
} from "../utils/validationUtils";

type Preprocessor = (
  content: string
) => Promise<{ text: string; metadata: Record<string, string | number> }>;

interface Params {
  inputDir: string;
  outputDir: string;
  llmClient: LlmClient;
  preprocessor?: Preprocessor;
}

export class DataExtractorUnified {
  public readonly inputDir: string;
  public readonly outputDir: string;

  #llmClient: LlmClient;
  #preprocessor: Preprocessor = (content: string) =>
    Promise.resolve({
      text: content,
      metadata: {}
    });

  constructor(params: Params) {
    this.inputDir = params.inputDir;
    this.outputDir = params.outputDir;
    this.#llmClient = params.llmClient;

    if (params.preprocessor) {
      this.#preprocessor = params.preprocessor;
    }
  }

  async run() {
    if (!existsSync(this.outputDir)) {
      await fs.mkdir(this.outputDir, { recursive: true });
    }

    const files = await fs.readdir(this.inputDir);

    for (const file of files) {
      // if (file !== "6281123.json") {
      //   continue;
      // }

      console.log(`IN FILE=${this.inputDir}/${file}`);
      const content = await fs.readFile(`${this.inputDir}/${file}`);
      const data = await this.#preprocessor(content.toString());
      const response = await this.#sendToLlm(data.text);

      await this.#saveResponse(
        file,
        JSON.stringify(
          {
            ...response,
            metadata: data.metadata
          },
          undefined,
          2
        )
      );
      // break;
    }
  }

  async #sendToLlm(text: string): Promise<NormalizedData | {}> {
    const instructions = `### ROLE ###
You are a precision-driven data extraction engine. Your function is to act as an expert specializing in identifying and extracting structured information about cyber incidents from unstructured text.

### OBJECTIVE ###
Your primary objective is to meticulously analyze the provided text, identify all relevant entities, and structure them into a single list within a strict JSON format.

### EXTRACTION SCHEMA & DEFINITIONS ###
You will extract all relevant entities into a single list called \`entities\`. Each item in the list will be an object with three keys: "name", "category", and "role".

1.  **Entity Object Structure**:
    * \`name\`: The name of the extracted entity (e.g., "Oblenergo", "Sandworm", "Cisco ASA Firewall").
    * \`category\`: The classification of the entity. You MUST choose one of the following values: ["Organization", "HackerGroup", "Software", "Country", "Individual", "Domain", "Sector", "Government Body", "Infrastructure", "Device"].
    * \`role\`: The role the entity played in the incident. You MUST choose one of the following values: ["Target", "Attacker", "Neutral"].

2.  **Category Definitions**:
    * \`Device\`: Refers to specific hardware, network appliances, or IoT/ICS equipment (e.g., "home routers", "firewalls", "PLCs", "IP cameras", "servers").

3.  **Role Definitions**:
    * \`Target\`: The entity is a victim or is directly associated with the victim's side.
    * \`Attacker\`: The entity is the aggressor, a tool used by the aggressor, or a resource controlled by the aggressor.
    * \`Neutral\`: The entity is a third-party observer, security researcher, news outlet, or any other party not directly involved in the conflict.

### OUTPUT FORMAT ###
You MUST return the extracted information in the exact JSON format specified below, containing a single key "entities" which holds the list of extracted entity objects.

{
  "entities": []
}

### EXAMPLE ###
**Input Text Example:**
"The threat group IronNomad, believed to be operating out of China, is exploiting a vulnerability in 'SmartHome V2' home routers. According to a report by the US-based security firm CyberTrace, thousands of these devices have been compromised. The attacker uses the compromised routers, controlled via the C2 domain control.ironnomad.net, to launch DDoS attacks against various Ukrainian news websites."

**Correct JSON Output for Example:**
{
  "entities": [
    {
      "name": "IronNomad",
      "category": "HackerGroup",
      "role": "Attacker"
    },
    {
      "name": "China",
      "category": "Country",
      "role": "Attacker"
    },
    {
      "name": "SmartHome V2 home routers",
      "category": "Device",
      "role": "Target"
    },
    {
      "name": "CyberTrace",
      "category": "Organization",
      "role": "Neutral"
    },
    {
      "name": "USA",
      "category": "Country",
      "role": "Neutral"
    },
    {
      "name": "control.ironnomad.net",
      "category": "Domain",
      "role": "Attacker"
    },
    {
      "name": "Ukrainian news websites",
      "category": "Sector",
      "role": "Target"
    }
  ]
}

### FINAL INSTRUCTIONS ###
- If no entities are found in the text, return an empty array \`[]\` for the \`entities\` key.
- The output MUST be a single, valid JSON object and nothing else.
- Do not include duplicate entities in the list. An entity is a duplicate if it has the same name, category, and role.
- **Exclusion Rule**: Do not extract any information related to "CERT-UA". Treat it as a neutral reporting body to be ignored completely.
- The text for you to analyze will be provided in the following user prompt. Apply all of these rules to that text.`;

    console.time("LLM PROCESSING");
    const result = await this.#llmClient.send(instructions, text);
    console.timeEnd("LLM PROCESSING");
    console.time("EXTRACT_JSON");
    // TODO: check if result contains JSON
    const rawData = extractAndParseJson(result);
    console.timeEnd("EXTRACT_JSON");

    if (!rawData) return {};

    console.time("NORMALIZE_DATA");
    const normalizedData = normalizeRawData(rawData);
    console.timeEnd("NORMALIZE_DATA");
    if (!normalizedData) {
    }
    return normalizedData || {};
  }

  async #saveResponse(originalFile: string, text: string) {
    const rawResultFile = `${this.outputDir}/${originalFile}`;
    console.log(`OUT FILE=${rawResultFile}`);
    await fs.writeFile(rawResultFile, text);
  }
}
