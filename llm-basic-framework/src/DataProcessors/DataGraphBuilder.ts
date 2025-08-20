import fs from "fs/promises";
import { existsSync } from "fs";
import { NormalizedData } from "../utils/validationUtils";

interface GraphNode {
  id: number;
  label: string;
  entityType: string;
  riskScore?: number;
}

interface GraphEdge {
  source: number;
  target: number;
  weight: number;
  edgeType: string;
  date: string;
  incidentIds: Set<number>;  // Track which incidents support this edge
}

interface ExtendedNormalizedData extends NormalizedData {
  metadata?: {
    date?: string;
    id?: number;
    title?: string;
  };
}

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
    const allData: ExtendedNormalizedData[] = [];
    for (const file of files) {
      console.log(`FILE=${file}`);
      const content = await fs.readFile(`${this.inputDir}/${file}`);
      const data = JSON.parse(content.toString()) as ExtendedNormalizedData;
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

  async #buildGraph(data: ExtendedNormalizedData[]): Promise<void> {
    const nodeMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    let nodeIdCounter = 1;

    // Helper function to get or create node
    const getOrCreateNode = (label: string, entityType: string, riskScore?: number): GraphNode => {
      const key = `${entityType}:${label}`;
      if (!nodeMap.has(key)) {
        const node: GraphNode = {
          id: nodeIdCounter++,
          label,
          entityType,
          riskScore
        };
        nodeMap.set(key, node);
      }
      return nodeMap.get(key)!;
    };

    // Process all data to extract nodes and edges
    for (const item of data) {
      const date = item.metadata?.date || 'unknown';
      const incidentId = item.metadata?.id || 0;
      
      // Process hacker groups
      const hackerGroups = item.normalizedHackerGroups || item.hackerGroups || [];
      for (const group of hackerGroups) {
        if (group) {
          getOrCreateNode(group, 'Hacker Group', 9.0);
        }
      }

      // Process attack targets
      const attackTargets = item.enrichedAttackTargets?.map(t => t.name) || item.attackTargets || [];
      for (const target of attackTargets) {
        if (target) {
          const targetNode = getOrCreateNode(target, 'Target', 8.0);
          
          // Create edges from hacker groups to targets
          for (const group of hackerGroups) {
            if (group) {
              const groupNode = getOrCreateNode(group, 'Hacker Group', 9.0);
              edges.push({
                source: groupNode.id,
                target: targetNode.id,
                weight: 1,
                edgeType: 'attacks',
                date,
                incidentIds: new Set([incidentId])
              });
            }
          }
        }
      }

      // Process applications (as malware/tools)
      const applications = item.normalizedApplications || item.applications || [];
      for (const app of applications) {
        if (app) {
          const appNode = getOrCreateNode(app, 'Tool', 7.0);
          
          // Create edges from hacker groups to tools
          for (const group of hackerGroups) {
            if (group) {
              const groupNode = getOrCreateNode(group, 'Hacker Group', 9.0);
              edges.push({
                source: groupNode.id,
                target: appNode.id,
                weight: 1,
                edgeType: 'uses_tool',
                date,
                incidentIds: new Set([incidentId])
              });
            }
          }
          
          // Create edges from tools to targets
          for (const target of attackTargets) {
            if (target) {
              const targetNode = getOrCreateNode(target, 'Target', 8.0);
              edges.push({
                source: appNode.id,
                target: targetNode.id,
                weight: 1,
                edgeType: 'used_on',
                date,
                incidentIds: new Set([incidentId])
              });
            }
          }
        }
      }

      // Process countries
      const countries = item.countries || [];
      for (const country of countries) {
        if (country?.name) {
          const riskScore = country.relation === 'attacker' ? 10.0 : 
                           country.relation === 'target' ? 8.0 : 5.0;
          const countryNode = getOrCreateNode(country.name, 'Country', riskScore);
          
          // Create edges based on relation
          if (country.relation === 'attacker') {
            // Connect attacking countries to hacker groups
            for (const group of hackerGroups) {
              if (group) {
                const groupNode = getOrCreateNode(group, 'Hacker Group', 9.0);
                edges.push({
                  source: groupNode.id,
                  target: countryNode.id,
                  weight: 1,
                  edgeType: 'attributed_to',
                  date,
                  incidentIds: new Set([incidentId])
                });
              }
            }
          } else if (country.relation === 'target') {
            // Connect target countries to attack targets
            for (const target of attackTargets) {
              if (target) {
                const targetNode = getOrCreateNode(target, 'Target', 8.0);
                edges.push({
                  source: countryNode.id,
                  target: targetNode.id,
                  weight: 1,
                  edgeType: 'located_in',
                  date,
                  incidentIds: new Set([incidentId])
                });
              }
            }
          }
        }
      }

      // Process organizations
      const organizations = item.normalizedOrganizations || item.organizations || [];
      for (const org of organizations) {
        if (org?.name) {
          const riskScore = org.relation === 'attacker' ? 9.0 : 
                           org.relation === 'target' ? 8.0 : 6.0;
          const orgNode = getOrCreateNode(org.name, 'Organization', riskScore);
          
          // Create edges based on relation
          if (org.relation === 'target') {
            // Connect attacking groups to target organizations
            for (const group of hackerGroups) {
              if (group) {
                const groupNode = getOrCreateNode(group, 'Hacker Group', 9.0);
                edges.push({
                  source: groupNode.id,
                  target: orgNode.id,
                  weight: 1,
                  edgeType: 'attacks',
                  date,
                  incidentIds: new Set([incidentId])
                });
              }
            }
          } else if (org.relation === 'attacker') {
            // Connect attacking organizations to targets
            for (const target of attackTargets) {
              if (target) {
                const targetNode = getOrCreateNode(target, 'Target', 8.0);
                edges.push({
                  source: orgNode.id,
                  target: targetNode.id,
                  weight: 1,
                  edgeType: 'attacks',
                  date,
                  incidentIds: new Set([incidentId])
                });
              }
            }
          }
        }
      }

      // Process individuals
      const individuals = item.normalizedIndividuals || item.individuals || [];
      for (const individual of individuals) {
        if (individual?.name) {
          const riskScore = individual.relation === 'attacker' ? 8.5 : 
                           individual.relation === 'target' ? 7.5 : 5.0;
          getOrCreateNode(individual.name, 'Individual', riskScore);
        }
      }

      // Process domains
      const domains = item.normalizedDomains || item.domains || [];
      for (const domain of domains) {
        if (domain?.name) {
          const riskScore = domain.relation === 'attacker' ? 8.0 : 
                           domain.relation === 'target' ? 7.0 : 4.0;
          const domainNode = getOrCreateNode(domain.name, 'Domain', riskScore);
          
          // Create edges from attacker domains to targets
          if (domain.relation === 'attacker') {
            for (const target of attackTargets) {
              if (target) {
                const targetNode = getOrCreateNode(target, 'Target', 8.0);
                edges.push({
                  source: domainNode.id,
                  target: targetNode.id,
                  weight: 1,
                  edgeType: 'used_against',
                  date,
                  incidentIds: new Set([incidentId])
                });
              }
            }
          }
        }
      }
    }

    // Aggregate edges by merging incident IDs for duplicate connections
    const edgeMap = new Map<string, GraphEdge>();
    for (const edge of edges) {
      const key = `${edge.source}-${edge.target}-${edge.edgeType}`;
      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key)!;
        // Merge incident IDs
        edge.incidentIds.forEach(id => existing.incidentIds.add(id));
        // Update weight to be the count of supporting facts (incidents)
        existing.weight = existing.incidentIds.size;
        // Keep the earliest date
        if (edge.date < existing.date && edge.date !== 'unknown') {
          existing.date = edge.date;
        }
      } else {
        // Clone the edge with proper weight
        edgeMap.set(key, { 
          ...edge,
          incidentIds: new Set(edge.incidentIds),
          weight: edge.incidentIds.size
        });
      }
    }

    // Write nodes.csv
    const nodesContent: string[] = ['Id;Label;EntityType;RiskScore'];
    const nodes = Array.from(nodeMap.values()).sort((a, b) => a.id - b.id);
    for (const node of nodes) {
      const riskScore = node.riskScore?.toFixed(1) || '0.0';
      nodesContent.push(`${node.id};${node.label};${node.entityType};${riskScore}`);
    }
    await fs.writeFile(`${this.outputDir}/nodes.csv`, nodesContent.join('\n'));

    // Write edges.csv
    const edgesContent: string[] = ['Source;Target;Weight;EdgeType;Date'];
    const aggregatedEdges = Array.from(edgeMap.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source - b.source;
      return a.target - b.target;
    });
    for (const edge of aggregatedEdges) {
      edgesContent.push(`${edge.source};${edge.target};${edge.weight};${edge.edgeType};${edge.date}`);
    }
    await fs.writeFile(`${this.outputDir}/edges.csv`, edgesContent.join('\n'));

    console.log(`Graph built with ${nodes.length} nodes and ${aggregatedEdges.length} edges`);
    console.log(`Output files: ${this.outputDir}/nodes.csv and ${this.outputDir}/edges.csv`);
  }
}
