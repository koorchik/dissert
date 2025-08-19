import fs from "fs/promises";
import { existsSync } from "fs";
import { NormalizedData } from "../utils/validationUtils";

interface Params {
  inputDir: string;
  outputDir: string;
}

export class DataGraphBuilder {
  public readonly inputDir: string;
  public readonly outputDir: string;

  constructor(params: Params) {
    this.inputDir = params.inputDir;
    this.outputDir = params.outputDir;
  }

  async run() {
    if (!existsSync(this.outputDir)) {
      await fs.mkdir(this.outputDir, { recursive: true });
    }

    const files = await fs.readdir(this.inputDir);
    const allData = [];
    for (const file of files) {
      console.log(`FILE=${file}`);
      const content = await fs.readFile(`${this.inputDir}/${file}`);
      const data = JSON.parse(content.toString()) as NormalizedData;
      allData.push(data);
    }
    await this.#buildGraph(allData);
  }

  // Builds graph as two files: nodes.csv, edges.csv
  // Format example for nodes.csv
  // Id;Label;EntityType;RiskScore
  // 1;Sandworm;Hacker Group;9.8
  // 2;APT28;Hacker Group;9.5
  // 3;Gamaredon;Hacker Group;8.8
  // 4;UNC1151;Hacker Group;8.5
  // 5;Turla;Hacker Group;9.1
  // 6;Укренерго;Target;10.0
  // 7;Міністерство оборони;Target;9.8
  // 8;ПриватБанк;Target;9.2
  // 9;Київстар;Target;9.7
  // 10;CERT-UA;Organization;7.5
  // 11;ГРУ РФ;State Actor;10.0
  // 12;ФСБ РФ;State Actor;10.0
  // 13;Industroyer2;Malware;9.6
  // 14;CaddyWiper;Malware;8.2
  // 15;Pterodo;Malware;7.8
  // 16;WhisperGate;Malware;8.9
  // 17;Cobalt Strike;Tool;8.0
  // 18;Росія;Country;10.0
  //
  // Format example for edges.csv
  // Source;Target;Weight;EdgeType;Date
  // 1;11;52;attributed_to;2023-01-10
  // 2;11;45;attributed_to;2023-01-11
  // 3;12;38;attributed_to;2023-02-15
  // 1;6;35;attacks;2023-10-22
  // 1;13;18;uses_tool;2023-10-21
  // 13;6;15;used_on;2023-10-22
  // 2;7;28;attacks;2023-05-18
  // 3;7;41;attacks;2024-02-20
  // 4;7;22;attacks;2023-03-30
  // 9;1;3;victim_of;2023-12-12
  // 1;14;11;uses_tool;2023-12-11
  // 14;9;9;used_on;2023-12-12
  // 11;18;150;part_of;2023-01-01
  // 12;18;145;part_of;2023-01-01
  // 10;6;8;warned_about;2023-10-20
  // 10;7;12;warned_about;2024-01-15
  // 5;7;7;attacks;2023-08-09
  // 2;17;25;uses_tool;2023-05-17
  // 3;15;31;uses_tool;2024-02-19
  // 16;7;10;used_on;2023-01-25

  async #buildGraph(data: NormalizedData[]): Promise<any | {}> {
    // TODO
  }
}
