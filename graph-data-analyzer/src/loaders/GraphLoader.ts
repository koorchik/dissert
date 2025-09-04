import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { SecurityGraph, NodeAttributes, EdgeAttributes, createGraph } from '../models/Graph';

export class GraphLoader {
  private nodesPath: string;
  private edgesPath: string;

  constructor(nodesPath: string, edgesPath: string) {
    this.nodesPath = nodesPath;
    this.edgesPath = edgesPath;
  }

  async load(): Promise<SecurityGraph> {
    const graph = createGraph();
    
    const nodesContent = readFileSync(this.nodesPath, 'utf-8');
    const nodes = parse(nodesContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ';'
    });

    for (const node of nodes) {
      const attributes: NodeAttributes = {
        label: node.Label,
        entityType: node.EntityType,
        riskScore: parseFloat(node.RiskScore || '0'),
        firstSeenDate: node.Date
      };
      graph.addNode(node.Id, attributes);
    }

    const edgesContent = readFileSync(this.edgesPath, 'utf-8');
    const edges = parse(edgesContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ';'
    });

    for (const edge of edges) {
      const attributes: EdgeAttributes = {
        weight: parseFloat(edge.Weight || '1'),
        edgeType: edge.EdgeType,
        date: edge.Date,
        incidentIds: ''
      };
      
      if (graph.hasNode(edge.Source) && graph.hasNode(edge.Target)) {
        if (edge.Source !== edge.Target && !graph.hasDirectedEdge(edge.Source, edge.Target)) {
          graph.addDirectedEdge(edge.Source, edge.Target, attributes);
        }
      }
    }

    return graph;
  }
}