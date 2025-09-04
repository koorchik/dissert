import { BaseAnalyzer, AnalysisResult, AnalysisOutput, TableSection, MetricsSummary } from './BaseAnalyzer';
import { SecurityGraph } from '../models/Graph';

interface ToolProfile {
  nodeId: string;
  label: string;
  entityType: string;
  riskScore: number;
  firstSeenDate: string;
  totalUsage: number;
  uniqueUsers: number;
  
  usedByGroups: Array<{
    groupId: string;
    groupLabel: string;
    usage: number;
    relationshipType: string;
    firstUsed: string;
  }>;
  
  // Also track if this tool attacks anything directly
  directAttacks: Array<{
    targetId: string;
    targetLabel: string;
    targetType: string;
    weight: number;
  }>;
}

interface ToolAnalysisResult {
  rank: number;
  label: string;
  type: string;
  totalUsage: number;
  uniqueUsers: number;
  riskScore: number;
  firstSeen: string;
  
  topUsers: Array<{
    group: string;
    usage: number;
    relationship: string;
    firstUsed: string;
  }>;
  
  directTargets: Array<{
    target: string;
    type: string;
    weight: number;
  }>;
  
  hasDirectAttacks: boolean;
}

export class AttackToolsAnalyzer extends BaseAnalyzer {
  private topN: number;

  constructor(graph: SecurityGraph, topN: number = 15) {
    super(graph);
    this.topN = topN;
  }

  getName(): string {
    return 'Attack Tools & Software Analysis';
  }

  getDescription(): string {
    return `Analyzes software and tools used by hacker groups, showing usage patterns and which groups use which tools`;
  }

  analyze(): AnalysisResult {
    const tools = new Map<string, ToolProfile>();
    
    // First, identify all software nodes that could be tools
    this.graph.forEachNode((nodeId, attrs) => {
      if (attrs.entityType === 'Software' || attrs.entityType === 'Domain' || 
          attrs.entityType === 'Infrastructure' || attrs.entityType === 'Device') {
        tools.set(nodeId, {
          nodeId,
          label: attrs.label,
          entityType: attrs.entityType,
          riskScore: attrs.riskScore,
          firstSeenDate: attrs.firstSeenDate,
          totalUsage: 0,
          uniqueUsers: 0,
          usedByGroups: [],
          directAttacks: []
        });
      }
    });

    // Analyze relationships to find tool usage patterns
    this.graph.forEachDirectedEdge((edgeId, attrs, source, target) => {
      const sourceAttrs = this.graph.getNodeAttributes(source);
      const targetAttrs = this.graph.getNodeAttributes(target);
      
      // Check if hacker groups use tools (uses_infrastructure relationship)
      if (sourceAttrs.entityType === 'HackerGroup' && tools.has(target)) {
        if (attrs.edgeType === 'uses_infrastructure') {
          const tool = tools.get(target)!;
          tool.totalUsage += attrs.weight;
          
          tool.usedByGroups.push({
            groupId: source,
            groupLabel: sourceAttrs.label,
            usage: attrs.weight,
            relationshipType: attrs.edgeType,
            firstUsed: attrs.date
          });
        }
      }
      
      // Check if tools directly attack targets
      if (tools.has(source) && attrs.edgeType === 'attacks') {
        const tool = tools.get(source)!;
        tool.directAttacks.push({
          targetId: target,
          targetLabel: targetAttrs.label,
          targetType: targetAttrs.entityType,
          weight: attrs.weight
        });
      }
    });

    // Filter to only tools that are actually used by groups or perform attacks
    const activeLyUsedTools = Array.from(tools.values())
      .filter(tool => tool.usedByGroups.length > 0 || tool.directAttacks.length > 0)
      .map(tool => {
        // Calculate unique users
        tool.uniqueUsers = new Set(tool.usedByGroups.map(u => u.groupId)).size;
        return tool;
      });

    // Sort by total usage (weight) and then by number of users
    activeLyUsedTools.sort((a, b) => {
      if (b.totalUsage !== a.totalUsage) {
        return b.totalUsage - a.totalUsage;
      }
      return b.uniqueUsers - a.uniqueUsers;
    });

    // Convert to analysis results
    const toolResults: ToolAnalysisResult[] = activeLyUsedTools
      .slice(0, this.topN)
      .map((tool, index) => {
        // Sort users by usage
        tool.usedByGroups.sort((a, b) => b.usage - a.usage);
        tool.directAttacks.sort((a, b) => b.weight - a.weight);

        return {
          rank: index + 1,
          label: tool.label,
          type: tool.entityType,
          totalUsage: tool.totalUsage,
          uniqueUsers: tool.uniqueUsers,
          riskScore: tool.riskScore,
          firstSeen: tool.firstSeenDate,
          
          topUsers: tool.usedByGroups.slice(0, 5).map(user => ({
            group: user.groupLabel.substring(0, 30),
            usage: user.usage,
            relationship: user.relationshipType,
            firstUsed: user.firstUsed
          })),
          
          directTargets: tool.directAttacks.slice(0, 5).map(attack => ({
            target: attack.targetLabel.substring(0, 30),
            type: attack.targetType,
            weight: attack.weight
          })),
          
          hasDirectAttacks: tool.directAttacks.length > 0
        };
      });

    // Calculate summary statistics
    const allActiveTools = activeLyUsedTools.length;
    const toolsWithDirectAttacks = activeLyUsedTools.filter(t => t.directAttacks.length > 0).length;
    const totalUsageAcrossAllTools = activeLyUsedTools.reduce((sum, t) => sum + t.totalUsage, 0);
    
    // Group by entity type
    const toolsByType = new Map<string, number>();
    activeLyUsedTools.forEach(tool => {
      toolsByType.set(tool.entityType, (toolsByType.get(tool.entityType) || 0) + 1);
    });

    const summary = {
      totalToolsInGraph: tools.size,
      activelyUsedTools: allActiveTools,
      toolsWithDirectAttacks,
      toolsWithoutDirectAttacks: allActiveTools - toolsWithDirectAttacks,
      totalUsageWeight: totalUsageAcrossAllTools,
      averageUsagePerTool: allActiveTools > 0 ? parseFloat((totalUsageAcrossAllTools / allActiveTools).toFixed(2)) : 0,
      softwareTools: toolsByType.get('Software') || 0,
      domainTools: toolsByType.get('Domain') || 0,
      infrastructureTools: toolsByType.get('Infrastructure') || 0,
      deviceTools: toolsByType.get('Device') || 0,
      mostUsedToolUsage: toolResults.length > 0 ? toolResults[0].totalUsage : 0
    };

    const sections: TableSection[] = [];

    // Add section for each tool
    toolResults.forEach(tool => {
      if (tool.topUsers && tool.topUsers.length > 0) {
        sections.push({
          title: `${tool.rank}. ${tool.label} (${tool.type}) - Usage: ${tool.totalUsage}, Users: ${tool.uniqueUsers}, ${tool.hasDirectAttacks ? 'Direct Attack Tool' : 'Infrastructure Tool'}`,
          headers: ['Hacker Group', 'Usage'],
          columnWidths: [40, 12],
          headerStyle: 'green',
          rows: tool.topUsers.map(user => [
            user.group,
            user.usage
          ]),
          showCount: { showing: Math.min(5, tool.topUsers.length), total: tool.uniqueUsers }
        });
      }
    });

    const output: AnalysisOutput = {
      summary: {
        title: 'KEY METRICS',
        metrics: [
          { label: 'totalToolsInGraph', value: summary.totalToolsInGraph },
          { label: 'activelyUsedTools', value: summary.activelyUsedTools },
          { label: 'toolsWithDirectAttacks', value: summary.toolsWithDirectAttacks },
          { label: 'mostUsedToolUsage', value: summary.mostUsedToolUsage },
          { label: 'softwareTools', value: summary.softwareTools },
          { label: 'domainTools', value: summary.domainTools }
        ]
      },
      sections
    };

    return {
      name: this.getName(),
      description: this.getDescription(),
      data: {
        summary,
        toolResults,
        parameters: {
          topN: this.topN
        }
      },
      output
    };
  }
}