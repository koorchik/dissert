import fs from "fs/promises";
import { existsSync } from "fs";

interface GraphNode {
  id: number;
  label: string;
  entityType: string;
  riskScore?: number;
  firstSeenDate: string;
}

interface GraphEdge {
  source: number;
  target: number;
  weight: number;
  edgeType: string;
  date: string;
  incidentIds: Set<number>;  // Track which incidents support this edge
}

interface Entity {
  name: string;
  category: string;
  role: string;
  normalizedName: string;
}

interface ProcessedIncident {
  entities: Entity[];
  metadata: {
    date: string;
    id: number;
    title: string;
    llmProcessingTimeSeconds?: number;
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
    const allData: ProcessedIncident[] = [];
    for (const file of files) {
      console.log(`FILE=${file}`);
      const content = await fs.readFile(`${this.inputDir}/${file}`);
      const data = JSON.parse(content.toString()) as ProcessedIncident;
      allData.push(data);
    }
    await this.#buildGraph(allData);
  }

  // Map category to entity type for graph visualization
  private mapCategoryToEntityType(category: string, role: string): string {
    const categoryMap: Record<string, string> = {
      'HackerGroup': 'Hacker Group',
      'Software': role === 'Attacker' ? 'Malware' : 'Tool',
      'Domain': 'Domain',
      'Organization': 'Organization',
      'Country': 'Country',
      'Individual': 'Individual',
      'Sector': 'Sector',
      'Government Body': 'Government Body',
      'Infrastructure': 'Infrastructure',
      'Device': 'Device'
    };
    return categoryMap[category] || category;
  }

  // Calculate risk score based on category and role
  private calculateRiskScore(category: string, role: string): number {
    if (role === 'Attacker') {
      switch(category) {
        case 'HackerGroup': return 9.0;
        case 'Software': return 8.0;
        case 'Domain': return 8.0;
        case 'Organization': return 9.0;
        case 'Country': return 10.0;
        case 'Individual': return 8.5;
        case 'Government Body': return 9.5;
        case 'Infrastructure': return 8.0;
        case 'Device': return 7.5;
        case 'Sector': return 7.0;
        default: return 7.0;
      }
    } else if (role === 'Victim' || role === 'Target') {
      switch(category) {
        case 'Organization': return 8.0;
        case 'Country': return 8.0;
        case 'Domain': return 7.0;
        case 'Software': return 6.0;
        case 'Individual': return 7.5;
        case 'Government Body': return 9.0;
        case 'Infrastructure': return 8.5;
        case 'Device': return 6.5;
        case 'Sector': return 7.5;
        default: return 6.0;
      }
    } else { // Neutral
      return 5.0;
    }
  }

  // Builds graph as two files: nodes.csv, edges.csv
  // Format example for nodes.csv
  // Id;Label;EntityType;RiskScore;Date
  // 1;Sandworm;Hacker Group;9.8;2023-01-10
  // 2;APT28;Hacker Group;9.5;2023-01-11
  // 3;Gamaredon;Hacker Group;8.8;2023-02-15
  // 4;UNC1151;Hacker Group;8.5;2023-03-30
  // 5;Turla;Hacker Group;9.1;2023-08-09
  // 6;Укренерго;Target;10.0;2023-10-20
  // 7;Міністерство оборони;Target;9.8;2023-01-25
  // 8;ПриватБанк;Target;9.2;2023-04-12
  // 9;Київстар;Target;9.7;2023-12-12
  // 10;CERT-UA;Organization;7.5;2023-01-15
  // 11;ГРУ РФ;State Actor;10.0;2023-01-01
  // 12;ФСБ РФ;State Actor;10.0;2023-01-01
  // 13;Industroyer2;Malware;9.6;2023-10-21
  // 14;CaddyWiper;Malware;8.2;2023-12-11
  // 15;Pterodo;Malware;7.8;2024-02-19
  // 16;WhisperGate;Malware;8.9;2023-01-25
  // 17;Cobalt Strike;Tool;8.0;2023-05-17
  // 18;Росія;Country;10.0;2023-01-01
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

  async #buildGraph(data: ProcessedIncident[]): Promise<void> {
    const nodeMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    let nodeIdCounter = 1;

    // Helper function to get or create node using normalizedName
    const getOrCreateNode = (entity: Entity, date: string): GraphNode => {
      const entityType = this.mapCategoryToEntityType(entity.category, entity.role);
      const riskScore = this.calculateRiskScore(entity.category, entity.role);
      const key = `${entityType}:${entity.normalizedName}`;
      
      if (!nodeMap.has(key)) {
        const node: GraphNode = {
          id: nodeIdCounter++,
          label: entity.name, // Use original name as label
          entityType,
          riskScore,
          firstSeenDate: date
        };
        nodeMap.set(key, node);
      } else {
        // Update firstSeenDate if this occurrence is earlier
        const existingNode = nodeMap.get(key)!;
        if (date !== 'unknown' && (existingNode.firstSeenDate === 'unknown' || date < existingNode.firstSeenDate)) {
          existingNode.firstSeenDate = date;
        }
      }
      return nodeMap.get(key)!;
    };

    // Helper function to convert dd.mm.yyyy to ISO 8601 format (yyyy-mm-dd)
    const convertToISO8601 = (dateStr: string): string => {
      if (!dateStr || dateStr === 'unknown') return 'unknown';
      
      // Check if date is already in ISO format (yyyy-mm-dd or yyyy-mm-ddTHH:MM:SS)
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.split('T')[0]; // Return just the date part if it includes time
      }
      
      // Convert dd.mm.yyyy to yyyy-mm-dd
      const ddmmyyyyPattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;
      const match = dateStr.match(ddmmyyyyPattern);
      
      if (match) {
        const [, day, month, year] = match;
        // Validate date components
        const dayNum = parseInt(day, 10);
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);
        
        if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
          throw new Error(`Invalid date components in '${dateStr}': day=${dayNum}, month=${monthNum}, year=${yearNum}`);
        }
        
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      // If format doesn't match expected patterns, throw an error
      throw new Error(`Unexpected date format: '${dateStr}'. Expected dd.mm.yyyy or yyyy-mm-dd format.`);
    };

    // Process all incidents to extract nodes and edges
    for (const incident of data) {
      const date = convertToISO8601(incident.metadata.date || 'unknown');
      const incidentId = incident.metadata.id || 0;
      
      // Separate entities by role and category
      const attackers = incident.entities.filter(e => e.role === 'Attacker');
      const victims = incident.entities.filter(e => e.role === 'Victim' || e.role === 'Target');
      const neutrals = incident.entities.filter(e => e.role === 'Neutral');
      
      // Create nodes for all entities
      incident.entities.forEach(entity => {
        getOrCreateNode(entity, date);
      });

      // Create edges based on relationships
      const hackerGroups = attackers.filter(e => e.category === 'HackerGroup');
      const attackerSoftware = attackers.filter(e => e.category === 'Software');
      const attackerDomains = attackers.filter(e => e.category === 'Domain');
      const attackerOrgs = attackers.filter(e => e.category === 'Organization');
      const attackerCountries = attackers.filter(e => e.category === 'Country');
      const attackerGovBodies = attackers.filter(e => e.category === 'Government Body');
      const attackerInfrastructure = attackers.filter(e => e.category === 'Infrastructure');
      const attackerDevices = attackers.filter(e => e.category === 'Device');
      
      const targetOrgs = victims.filter(e => e.category === 'Organization');
      const targetCountries = victims.filter(e => e.category === 'Country');
      const targetDomains = victims.filter(e => e.category === 'Domain');
      const targetSoftware = victims.filter(e => e.category === 'Software');
      const targetGovBodies = victims.filter(e => e.category === 'Government Body');
      const targetSectors = victims.filter(e => e.category === 'Sector');
      const targetInfrastructure = victims.filter(e => e.category === 'Infrastructure');
      const targetDevices = victims.filter(e => e.category === 'Device');
      const targetIndividuals = victims.filter(e => e.category === 'Individual');
      
      // Combine all target entities for attack relationships
      const allTargets = [
        ...targetOrgs,
        ...targetGovBodies,
        ...targetSectors,
        ...targetInfrastructure,
        ...targetDevices,
        ...targetIndividuals
      ];

      // Hacker groups attack all types of targets
      for (const group of hackerGroups) {
        const groupNode = getOrCreateNode(group, date);
        
        // Attack all target entities
        for (const target of allTargets) {
          const targetNode = getOrCreateNode(target, date);
          edges.push({
            source: groupNode.id,
            target: targetNode.id,
            weight: 1,
            edgeType: 'attacks',
            date,
            incidentIds: new Set([incidentId])
          });
        }
        
        // Use attacker software/tools
        for (const software of attackerSoftware) {
          const softwareNode = getOrCreateNode(software, date);
          edges.push({
            source: groupNode.id,
            target: softwareNode.id,
            weight: 1,
            edgeType: 'uses_tool',
            date,
            incidentIds: new Set([incidentId])
          });
        }
        
        // Use attacker infrastructure (domains, infrastructure, devices)
        for (const domain of attackerDomains) {
          const domainNode = getOrCreateNode(domain, date);
          edges.push({
            source: groupNode.id,
            target: domainNode.id,
            weight: 1,
            edgeType: 'uses_infrastructure',
            date,
            incidentIds: new Set([incidentId])
          });
        }
        
        for (const infra of attackerInfrastructure) {
          const infraNode = getOrCreateNode(infra, date);
          edges.push({
            source: groupNode.id,
            target: infraNode.id,
            weight: 1,
            edgeType: 'uses_infrastructure',
            date,
            incidentIds: new Set([incidentId])
          });
        }
        
        for (const device of attackerDevices) {
          const deviceNode = getOrCreateNode(device, date);
          edges.push({
            source: groupNode.id,
            target: deviceNode.id,
            weight: 1,
            edgeType: 'uses_device',
            date,
            incidentIds: new Set([incidentId])
          });
        }
        
        // Attribution to attacker countries
        for (const country of attackerCountries) {
          const countryNode = getOrCreateNode(country, date);
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
      
      // Attacker software used against all targets
      for (const software of attackerSoftware) {
        const softwareNode = getOrCreateNode(software, date);
        
        for (const target of allTargets) {
          const targetNode = getOrCreateNode(target, date);
          edges.push({
            source: softwareNode.id,
            target: targetNode.id,
            weight: 1,
            edgeType: 'used_on',
            date,
            incidentIds: new Set([incidentId])
          });
        }
      }
      
      // Attacker infrastructure used against targets
      const attackerInfra = [...attackerDomains, ...attackerInfrastructure, ...attackerDevices];
      for (const infra of attackerInfra) {
        const infraNode = getOrCreateNode(infra, date);
        
        for (const target of allTargets) {
          const targetNode = getOrCreateNode(target, date);
          edges.push({
            source: infraNode.id,
            target: targetNode.id,
            weight: 1,
            edgeType: 'used_against',
            date,
            incidentIds: new Set([incidentId])
          });
        }
      }
      
      // All target entities located in/belonging to target countries
      for (const target of [...targetOrgs, ...targetGovBodies, ...targetInfrastructure]) {
        const targetNode = getOrCreateNode(target, date);
        
        for (const country of targetCountries) {
          const countryNode = getOrCreateNode(country, date);
          edges.push({
            source: targetNode.id,
            target: countryNode.id,
            weight: 1,
            edgeType: 'located_in',
            date,
            incidentIds: new Set([incidentId])
          });
        }
      }
      
      // Target entities belonging to sectors
      for (const target of [...targetOrgs, ...targetGovBodies]) {
        const targetNode = getOrCreateNode(target, date);
        
        for (const sector of targetSectors) {
          const sectorNode = getOrCreateNode(sector, date);
          edges.push({
            source: targetNode.id,
            target: sectorNode.id,
            weight: 1,
            edgeType: 'belongs_to',
            date,
            incidentIds: new Set([incidentId])
          });
        }
      }
      
      // Attacker organizations and government bodies attacking targets
      const attackerEntities = [...attackerOrgs, ...attackerGovBodies];
      for (const attacker of attackerEntities) {
        const attackerNode = getOrCreateNode(attacker, date);
        
        for (const target of allTargets) {
          const targetNode = getOrCreateNode(target, date);
          edges.push({
            source: attackerNode.id,
            target: targetNode.id,
            weight: 1,
            edgeType: 'attacks',
            date,
            incidentIds: new Set([incidentId])
          });
        }
      }
      
      // Government bodies related to countries (attribution)
      for (const govBody of attackerGovBodies) {
        const govBodyNode = getOrCreateNode(govBody, date);
        
        for (const country of attackerCountries) {
          const countryNode = getOrCreateNode(country, date);
          edges.push({
            source: govBodyNode.id,
            target: countryNode.id,
            weight: 1,
            edgeType: 'part_of',
            date,
            incidentIds: new Set([incidentId])
          });
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
    const nodesContent: string[] = ['Id;Label;EntityType;RiskScore;Date'];
    const nodes = Array.from(nodeMap.values()).sort((a, b) => a.id - b.id);
    for (const node of nodes) {
      const riskScore = node.riskScore?.toFixed(1) || '0.0';
      nodesContent.push(`${node.id};${node.label};${node.entityType};${riskScore};${node.firstSeenDate}`);
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
