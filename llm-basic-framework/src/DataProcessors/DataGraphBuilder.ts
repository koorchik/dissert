import { existsSync } from 'fs';
import fs from 'fs/promises';

// --- Interfaces (unchanged) ---
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
  incidentIds: Set<number>;
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

  private calculateRiskScore(category: string, role: string): number {
    if (role === 'Attacker') {
      switch (category) {
        case 'HackerGroup':
          return 9.0;
        case 'Software':
          return 8.0;
        case 'Domain':
          return 8.0;
        case 'Organization':
          return 9.0;
        case 'Country':
          return 10.0;
        case 'Individual':
          return 8.5;
        case 'Government Body':
          return 9.5;
        case 'Infrastructure':
          return 8.0;
        case 'Device':
          return 7.5;
        case 'Sector':
          return 7.0;
        default:
          return 7.0;
      }
    } else if (role === 'Target') {
      switch (category) {
        case 'Organization':
          return 8.0;
        case 'Country':
          return 8.0;
        case 'Domain':
          return 7.0;
        case 'Software':
          return 6.0;
        case 'Individual':
          return 7.5;
        case 'Government Body':
          return 9.0;
        case 'Infrastructure':
          return 8.5;
        case 'Device':
          return 6.5;
        case 'Sector':
          return 7.5;
        default:
          return 6.0;
      }
    } else {
      // Neutral
      return 5.0;
    }
  }

  #inferRelationship(
    entity1: Entity,
    entity2: Entity
  ): { source: Entity; target: Entity; edgeType: string } | null {
    const roles = [entity1.role, entity2.role].sort().join('-');
    const categories = [entity1.category, entity2.category].sort().join('-');

    // --- Pre-switch special handling for hierarchical relationships ---
    // This creates structural links regardless of roles.
    if (
      categories.includes('Sector') &&
      (categories.includes('Organization') || categories.includes('Government Body'))
    ) {
      const org = entity1.category === 'Sector' ? entity2 : entity1;
      const sector = entity1.category === 'Sector' ? entity1 : entity2;
      return { source: org, target: sector, edgeType: 'belongs_to_sector' };
    }

    switch (roles) {
      case 'Attacker-Target': {
        const source = entity1.role === 'Attacker' ? entity1 : entity2;
        const target = entity1.role === 'Target' ? entity1 : entity2;
        return { source, target, edgeType: 'attacks' };
      }

      case 'Attacker-Attacker': {
        // Priority handling for Sector: Semantically, a Sector is a target,
        // even if mislabeled as an Attacker. This relationship should be 'attacks'.
        if (entity1.category === 'Sector' || entity2.category === 'Sector') {
          const attacker = entity1.category === 'Sector' ? entity2 : entity1;
          const target = entity1.category === 'Sector' ? entity1 : entity2;
          return { source: attacker, target: target, edgeType: 'attacks' };
        }

        // First, handle the special case of collaboration between equal actors
        if (entity1.category === 'HackerGroup' && entity2.category === 'HackerGroup') {
          return { source: entity1, target: entity2, edgeType: 'collaborates_with' };
        }

        // Hierarchical logic to determine the "actor" and the "asset"
        const categoryPriority: Record<string, number> = {
          HackerGroup: 1,
          Individual: 2,
          Country: 3,
          'Government Body': 3,
          Organization: 4, // Attacker organizations
          Software: 5,
          Domain: 6,
          Infrastructure: 6,
          Device: 6,
        };

        const priority1 = categoryPriority[entity1.category] || 99;
        const priority2 = categoryPriority[entity2.category] || 99;

        const actor = priority1 <= priority2 ? entity1 : entity2;
        const asset = priority1 <= priority2 ? entity2 : entity1;

        // Rule 1: Attribution (who is behind whom)
        if (
          ['HackerGroup', 'Individual', 'Organization'].includes(actor.category) &&
          ['Country', 'Government Body'].includes(asset.category)
        ) {
          return { source: actor, target: asset, edgeType: 'is_attributed_to' };
        }

        // Rule 2: Infrastructure Usage (who uses what)
        if (
          ['HackerGroup', 'Individual', 'Country', 'Government Body', 'Organization'].includes(
            actor.category
          ) &&
          ['Software', 'Domain', 'Infrastructure', 'Device'].includes(asset.category)
        ) {
          return { source: actor, target: asset, edgeType: 'uses_infrastructure' };
        }

        // Fallback for other Attacker-Attacker pairs (e.g., two state actors)
        return { source: actor, target: asset, edgeType: 'collaborates_with' };
      }

      case 'Attacker-Neutral': {
        const source = entity1.role === 'Neutral' ? entity1 : entity2;
        const target = entity1.role === 'Attacker' ? entity1 : entity2;
        return { source, target, edgeType: 'mentioned_in_context_of' };
      }

      case 'Neutral-Target': {
        const source = entity1.role === 'Neutral' ? entity1 : entity2;
        const target = entity1.role === 'Target' ? entity1 : entity2;
        return { source, target, edgeType: 'mentioned_in_context_of' };
      }

      default: {
        // Covers Neutral-Neutral, Target-Target
        if (roles === 'Target-Target') {
          return { source: entity1, target: entity2, edgeType: 'co_targeted' };
        }
        // General fallback for any other combination (e.g., Neutral-Neutral)
        return { source: entity1, target: entity2, edgeType: 'related_to' };
      }
    }
  }

  // nodes.csv
  // Id;Label;EntityType;RiskScore;Date
  // 101;Sandworm;Hacker Group;9.8;2024-01-15
  // 102;APT28;Hacker Group;9.5;2024-02-20
  // 201;Russian Federation;Country;10.0;2024-01-01
  // 301;Ukrenergo;Organization;9.9;2024-03-10
  // 302;Energy Sector;Sector;10.0;2024-01-01
  // 401;Industroyer2;Malware;9.6;2024-03-05
  // 501;SBU;Government Body;7.5;2024-01-20
  // 303;Ministry of Defence of Ukraine;Government Body;9.8;2024-02-21
  //
  // edges.csv
  // Source;Target;Weight;EdgeType;Date
  // 101;201;55;associated_with;2024-01-15
  // 102;201;48;associated_with;2024-02-20
  // 101;401;25;uses_tool;2024-03-05
  // 101;301;40;attacks;2024-03-10
  // 401;301;38;attacks;2024-03-11
  // 301;302;150;belongs_to_sector;2024-01-01
  // 501;101;12;mentioned_in_context_of;2024-04-05
  // 102;303;29;attacks;2024-02-22
  async #buildGraph(data: ProcessedIncident[]): Promise<void> {
    const nodeMap = new Map<string, GraphNode>();
    const edges: Omit<GraphEdge, 'weight'>[] = [];
    let nodeIdCounter = 1;

    const getOrCreateNode = (entity: Entity, date: string): GraphNode => {
      const entityType = entity.category;
      const riskScore = this.calculateRiskScore(entity.category, entity.role);
      const key = `${entityType}:${entity.normalizedName}`;

      if (!nodeMap.has(key)) {
        const node: GraphNode = {
          id: nodeIdCounter++,
          label: entity.normalizedName,
          entityType,
          riskScore,
          firstSeenDate: date,
        };
        nodeMap.set(key, node);
      } else {
        const existingNode = nodeMap.get(key)!;
        if (
          date !== 'unknown' &&
          (existingNode.firstSeenDate === 'unknown' || date < existingNode.firstSeenDate)
        ) {
          existingNode.firstSeenDate = date;
        }
      }
      return nodeMap.get(key)!;
    };

    const convertToISO8601 = (dateStr: string): string => {
      if (!dateStr || dateStr === 'unknown') return 'unknown';
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.split('T')[0];
      }
      const ddmmyyyyPattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;
      const match = dateStr.match(ddmmyyyyPattern);
      if (match) {
        const [, day, month, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      // Return 'unknown' instead of error for robustness
      console.warn(`Unexpected date format: '${dateStr}'. Treating as unknown.`);
      return 'unknown';
    };

    console.log('Building graph using rule-based relationship inference...');
    for (const incident of data) {
      const date = convertToISO8601(incident.metadata.date || 'unknown');
      const incidentId = incident.metadata.id || 0;
      const { entities } = incident;

      // 1. Create all nodes mentioned in the incident
      entities.forEach((entity) => getOrCreateNode(entity, date));

      // 2. Generate edges for all unique entity pairs in the incident
      if (entities.length < 2) continue;

      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const entity1 = entities[i];
          const entity2 = entities[j];

          const relationship = this.#inferRelationship(entity1, entity2);

          if (relationship) {
            const sourceNode = getOrCreateNode(relationship.source, date);
            const targetNode = getOrCreateNode(relationship.target, date);

            // Add edge to temporary list
            edges.push({
              source: sourceNode.id,
              target: targetNode.id,
              edgeType: relationship.edgeType,
              date,
              incidentIds: new Set([incidentId]),
            });
          }
        }
      }
    }

    // --- Edge aggregation and file writing (logic mostly preserved) ---
    console.log('Aggregating edges...');
    const edgeMap = new Map<string, GraphEdge>();
    for (const edge of edges) {
      // Key now includes direction to avoid incorrect merging
      const key = `${edge.source}-${edge.target}-${edge.edgeType}`;

      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key)!;
        edge.incidentIds.forEach((id) => existing.incidentIds.add(id));
        existing.weight = existing.incidentIds.size;
        if (edge.date !== 'unknown' && (existing.date === 'unknown' || edge.date < existing.date)) {
          existing.date = edge.date;
        }
      } else {
        edgeMap.set(key, {
          ...edge,
          weight: 1, // Initial weight 1
          incidentIds: new Set(edge.incidentIds),
        });
      }
    }

    // Write nodes to nodes.csv
    const nodesContent: string[] = ['Id;Label;EntityType;RiskScore;Date'];
    const nodes = Array.from(nodeMap.values()).sort((a, b) => a.id - b.id);
    for (const node of nodes) {
      const riskScore = node.riskScore?.toFixed(1) || '0.0';
      nodesContent.push(
        `${node.id};"${node.label.replace(/"/g, '""')}";"${node.entityType}";${riskScore};${node.firstSeenDate}`
      );
    }
    await fs.writeFile(`${this.outputDir}/nodes.csv`, nodesContent.join('\n'));

    // Write edges to edges.csv
    const edgesContent: string[] = ['Source;Target;Weight;EdgeType;Date'];
    const aggregatedEdges = Array.from(edgeMap.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source - b.source;
      return a.target - b.target;
    });
    for (const edge of aggregatedEdges) {
      edgesContent.push(
        `${edge.source};${edge.target};${edge.weight};${edge.edgeType};${edge.date}`
      );
    }
    await fs.writeFile(`${this.outputDir}/edges.csv`, edgesContent.join('\n'));

    console.log(`Graph built with ${nodes.length} nodes and ${aggregatedEdges.length} edges`);
    console.log(`Output files: ${this.outputDir}/nodes.csv and ${this.outputDir}/edges.csv`);
  }
}
