import { BaseAnalyzer, AnalysisResult, AnalysisOutput, TableSection, MetricsSummary } from './BaseAnalyzer';
import { SecurityGraph } from '../models/Graph';

interface EdgeWithDetails {
  edgeId: string;
  source: string;
  sourceLabel: string;
  sourceType: string;
  target: string;
  targetLabel: string;
  targetType: string;
  weight: number;
  edgeType: string;
  date: string;
}

interface EdgeTypeGroup {
  edgeType: string;
  topEdges: Array<{
    rank: number;
    sourceLabel: string;
    targetLabel: string;
    weight: number;
    sourceType: string;
    targetType: string;
    date: string;
  }>;
  totalCount: number;
  totalWeight: number;
  avgWeight: number;
  maxWeight: number;
}

export class HighestWeightEdgesAnalyzer extends BaseAnalyzer {
  private topN: number;

  constructor(graph: SecurityGraph, topN: number = 10) {
    super(graph);
    this.topN = topN;
  }

  getName(): string {
    return 'Highest Weight Edges Analysis';
  }

  getDescription(): string {
    return `Identifies the top ${this.topN} edges with highest weights, both overall and grouped by edge type`;
  }

  analyze(): AnalysisResult {
    const allEdges: EdgeWithDetails[] = [];
    const edgeTypeStats = new Map<string, { edges: EdgeWithDetails[], totalWeight: number }>();

    // Collect all edges with their details
    this.graph.forEachDirectedEdge((edgeId, attrs, source, target) => {
      const sourceAttrs = this.graph.getNodeAttributes(source);
      const targetAttrs = this.graph.getNodeAttributes(target);

      const edgeDetails: EdgeWithDetails = {
        edgeId,
        source,
        sourceLabel: sourceAttrs.label,
        sourceType: sourceAttrs.entityType,
        target,
        targetLabel: targetAttrs.label,
        targetType: targetAttrs.entityType,
        weight: attrs.weight,
        edgeType: attrs.edgeType,
        date: attrs.date
      };

      allEdges.push(edgeDetails);

      // Group by edge type
      if (!edgeTypeStats.has(attrs.edgeType)) {
        edgeTypeStats.set(attrs.edgeType, { edges: [], totalWeight: 0 });
      }
      const typeGroup = edgeTypeStats.get(attrs.edgeType)!;
      typeGroup.edges.push(edgeDetails);
      typeGroup.totalWeight += attrs.weight;
    });

    // Sort all edges by weight
    allEdges.sort((a, b) => b.weight - a.weight);

    // Get top N overall
    const topOverall = allEdges.slice(0, this.topN).map((edge, index) => ({
      rank: index + 1,
      sourceLabel: edge.sourceLabel.substring(0, 30),
      targetLabel: edge.targetLabel.substring(0, 30),
      weight: edge.weight,
      edgeType: edge.edgeType,
      sourceType: edge.sourceType,
      targetType: edge.targetType,
      date: edge.date
    }));

    // Process each edge type
    const edgeTypeGroups: EdgeTypeGroup[] = [];
    for (const [edgeType, stats] of edgeTypeStats) {
      // Sort edges of this type by weight
      stats.edges.sort((a, b) => b.weight - a.weight);
      
      const weights = stats.edges.map(e => e.weight);
      const maxWeight = Math.max(...weights);
      const avgWeight = stats.totalWeight / stats.edges.length;

      edgeTypeGroups.push({
        edgeType,
        topEdges: stats.edges.slice(0, this.topN).map((edge, index) => ({
          rank: index + 1,
          sourceLabel: edge.sourceLabel.substring(0, 30),
          targetLabel: edge.targetLabel.substring(0, 30),
          weight: edge.weight,
          sourceType: edge.sourceType,
          targetType: edge.targetType,
          date: edge.date
        })),
        totalCount: stats.edges.length,
        totalWeight: stats.totalWeight,
        avgWeight: parseFloat(avgWeight.toFixed(2)),
        maxWeight
      });
    }

    // Sort edge type groups by total weight
    edgeTypeGroups.sort((a, b) => b.totalWeight - a.totalWeight);

    // Calculate summary statistics
    const summary = {
      totalEdges: allEdges.length,
      totalWeight: allEdges.reduce((sum, e) => sum + e.weight, 0),
      averageWeight: parseFloat((allEdges.reduce((sum, e) => sum + e.weight, 0) / allEdges.length).toFixed(2)),
      maxWeight: Math.max(...allEdges.map(e => e.weight)),
      uniqueEdgeTypes: edgeTypeStats.size,
      edgesAboveWeight10: allEdges.filter(e => e.weight >= 10).length,
      edgesAboveWeight50: allEdges.filter(e => e.weight >= 50).length,
      edgesAboveWeight100: allEdges.filter(e => e.weight >= 100).length
    };

    const sections: TableSection[] = [];

    // Add top overall edges section
    sections.push({
      title: 'TOP EDGES (OVERALL)',
      headers: ['Rank', 'Source', 'Target', 'Weight', 'Type', 'Date'],
      columnWidths: [6, 25, 25, 10, 20, 12],
      rows: topOverall.map(edge => [
        edge.rank,
        edge.sourceLabel,
        edge.targetLabel,
        edge.weight,
        edge.edgeType,
        edge.date
      ]),
      showCount: { showing: topOverall.length, total: allEdges.length }
    });

    // Add sections for each edge type
    edgeTypeGroups.forEach(group => {
      sections.push({
        title: `EDGES BY TYPE - ${group.edgeType}`,
        headers: ['Rank', 'Source', 'Target', 'Weight', 'S.Type', 'T.Type'],
        columnWidths: [6, 25, 25, 10, 15, 15],
        rows: group.topEdges.map(edge => [
          edge.rank,
          edge.sourceLabel,
          edge.targetLabel,
          edge.weight,
          edge.sourceType,
          edge.targetType
        ]),
        showCount: { showing: group.topEdges.length, total: group.totalCount }
      });
    });

    const output: AnalysisOutput = {
      summary: {
        title: 'KEY METRICS',
        metrics: [
          { label: 'totalEdges', value: summary.totalEdges },
          { label: 'maxWeight', value: summary.maxWeight },
          { label: 'uniqueEdgeTypes', value: summary.uniqueEdgeTypes },
          { label: 'averageWeight', value: summary.averageWeight },
          { label: 'edgesAboveWeight10', value: summary.edgesAboveWeight10 },
          { label: 'edgesAboveWeight50', value: summary.edgesAboveWeight50 }
        ]
      },
      sections
    };

    return {
      name: this.getName(),
      description: this.getDescription(),
      data: {
        summary,
        topOverall,
        edgeTypeGroups,
        parameters: {
          topN: this.topN
        }
      },
      output
    };
  }
}