import { BaseAnalyzer, AnalysisResult, AnalysisOutput, TableSection, MetricsSummary } from './BaseAnalyzer';
import { SecurityGraph } from '../models/Graph';

interface NodeAttackStats {
  nodeId: string;
  label: string;
  entityType: string;
  riskScore: number;
  incomingAttackCount: number;
  totalWeight: number;
  attackers: Set<string>;
}

interface TopAttackedByType {
  entityType: string;
  topNodes: Array<{
    rank: number;
    nodeId: string;
    label: string;
    riskScore: number;
    attackCount: number;
    totalWeight: number;
    uniqueAttackers: number;
  }>;
  totalCount: number;
}

export class TopIncomingAttacksAnalyzer extends BaseAnalyzer {
  private topN: number;

  constructor(graph: SecurityGraph, topN: number = 10) {
    super(graph);
    this.topN = topN;
  }

  getName(): string {
    return 'Top Incoming Attacks Analysis';
  }

  getDescription(): string {
    return `Identifies the top ${this.topN} most attacked nodes for each entity type based on incoming attack relationships`;
  }

  analyze(): AnalysisResult {
    const nodeStats = new Map<string, NodeAttackStats>();
    
    const entityTypes = new Set<string>();
    this.graph.forEachNode((nodeId, attrs) => {
      entityTypes.add(attrs.entityType);
      nodeStats.set(nodeId, {
        nodeId,
        label: attrs.label,
        entityType: attrs.entityType,
        riskScore: attrs.riskScore,
        incomingAttackCount: 0,
        totalWeight: 0,
        attackers: new Set()
      });
    });

    this.graph.forEachDirectedEdge((edgeId, attrs, source, target) => {
      if (attrs.edgeType === 'attacks') {
        const targetStats = nodeStats.get(target);
        if (targetStats) {
          targetStats.incomingAttackCount++;
          targetStats.totalWeight += attrs.weight;
          targetStats.attackers.add(source);
        }
      }
    });

    const resultsByType: TopAttackedByType[] = [];
    
    for (const entityType of entityTypes) {
      const allNodesOfType = Array.from(nodeStats.values())
        .filter(node => node.entityType === entityType && node.incomingAttackCount > 0)
        .sort((a, b) => {
          if (b.incomingAttackCount !== a.incomingAttackCount) {
            return b.incomingAttackCount - a.incomingAttackCount;
          }
          return b.totalWeight - a.totalWeight;
        });

      const topNodesOfType = allNodesOfType.slice(0, this.topN);

      if (topNodesOfType.length > 0) {
        resultsByType.push({
          entityType,
          topNodes: topNodesOfType.map((node, index) => ({
            rank: index + 1,
            nodeId: node.nodeId,
            label: node.label,
            riskScore: node.riskScore,
            attackCount: node.incomingAttackCount,
            totalWeight: node.totalWeight,
            uniqueAttackers: node.attackers.size
          })),
          totalCount: allNodesOfType.length
        });
      }
    }

    const summary = {
      totalEntityTypes: entityTypes.size,
      entityTypesWithAttacks: resultsByType.length,
      totalNodesAnalyzed: this.graph.order,
      totalEdgesAnalyzed: this.graph.size,
      attackEdgesFound: Array.from(nodeStats.values())
        .reduce((sum, node) => sum + node.incomingAttackCount, 0)
    };

    const output: AnalysisOutput = {
      summary: {
        title: 'KEY METRICS',
        metrics: [
          { label: 'totalEntityTypes', value: summary.totalEntityTypes },
          { label: 'entityTypesWithAttacks', value: summary.entityTypesWithAttacks },
          { label: 'totalNodesAnalyzed', value: summary.totalNodesAnalyzed },
          { label: 'attackEdgesFound', value: summary.attackEdgesFound }
        ]
      },
      sections: resultsByType.map(typeResult => ({
        title: `RESULTS BY ENTITY TYPE - ${typeResult.entityType}`,
        headers: ['Rank', 'Label', 'Attacks', 'Weight', 'Attackers', 'Risk'],
        columnWidths: [6, 30, 10, 10, 11, 8],
        rows: typeResult.topNodes.map(node => [
          node.rank,
          node.label.substring(0, 28),
          node.attackCount,
          node.totalWeight.toFixed(1),
          node.uniqueAttackers,
          node.riskScore.toFixed(1)
        ]),
        showCount: {
          showing: typeResult.topNodes.length,
          total: typeResult.totalCount
        }
      }))
    };

    return {
      name: this.getName(),
      description: this.getDescription(),
      data: {
        summary,
        resultsByType,
        parameters: {
          topN: this.topN
        }
      },
      output
    };
  }
}