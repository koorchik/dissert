import Graph from 'graphology';

export interface NodeAttributes {
  label: string;
  entityType: string;
  riskScore: number;
  firstSeenDate: string;
}

export interface EdgeAttributes {
  weight: number;
  edgeType: string;
  date: string;
  incidentIds: string;
}

export type SecurityGraph = Graph<NodeAttributes, EdgeAttributes>;

export function createGraph(): SecurityGraph {
  return new Graph<NodeAttributes, EdgeAttributes>({ 
    type: 'directed',
    multi: false,
    allowSelfLoops: false
  });
}