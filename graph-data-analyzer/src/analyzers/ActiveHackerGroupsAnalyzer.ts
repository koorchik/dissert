import { BaseAnalyzer, AnalysisResult, AnalysisOutput, TableSection, MetricsSummary } from './BaseAnalyzer';
import { SecurityGraph } from '../models/Graph';

interface HackerGroupProfile {
  nodeId: string;
  label: string;
  totalAttackWeight: number;
  attackCount: number;
  firstSeenDate: string;
  riskScore: number;
  
  // Target analysis
  targets: Array<{
    nodeId: string;
    label: string;
    entityType: string;
    weight: number;
  }>;
  targetsByType: Map<string, number>;
  
  // Country associations
  countryAssociations: Array<{
    nodeId: string;
    label: string;
    relationshipType: string;
    weight: number;
  }>;
  
  // Tools and infrastructure used
  toolsUsed: Array<{
    nodeId: string;
    label: string;
    entityType: string;
    relationshipType: string;
    weight: number;
  }>;
  
  // Collaboration with other groups
  collaborations: Array<{
    nodeId: string;
    label: string;
    weight: number;
  }>;
}

interface GroupAnalysisResult {
  rank: number;
  label: string;
  totalAttackWeight: number;
  attackCount: number;
  uniqueTargets: number;
  riskScore: number;
  firstSeen: string;
  
  topTargets: Array<{
    label: string;
    type: string;
    weight: number;
  }>;
  
  targetDistribution: Array<{
    entityType: string;
    count: number;
    totalWeight: number;
  }>;
  
  countryLinks: Array<{
    country: string;
    relationship: string;
    weight: number;
  }>;
  
  mainTools: Array<{
    tool: string;
    type: string;
    relationship: string;
    weight: number;
  }>;
  
  partnerships: Array<{
    partner: string;
    weight: number;
  }>;
}

export class ActiveHackerGroupsAnalyzer extends BaseAnalyzer {
  private topN: number;

  constructor(graph: SecurityGraph, topN: number = 10) {
    super(graph);
    this.topN = topN;
  }

  getName(): string {
    return 'Active Hacker Groups Analysis';
  }

  getDescription(): string {
    return `Analyzes the top ${this.topN} most active hacker groups based on their attack patterns, showing targets, country associations, tools used, and partnerships`;
  }

  analyze(): AnalysisResult {
    const hackerGroups = new Map<string, HackerGroupProfile>();
    
    // Find all hacker group nodes
    this.graph.forEachNode((nodeId, attrs) => {
      if (attrs.entityType === 'HackerGroup') {
        hackerGroups.set(nodeId, {
          nodeId,
          label: attrs.label,
          totalAttackWeight: 0,
          attackCount: 0,
          firstSeenDate: attrs.firstSeenDate,
          riskScore: attrs.riskScore,
          targets: [],
          targetsByType: new Map(),
          countryAssociations: [],
          toolsUsed: [],
          collaborations: []
        });
      }
    });

    // Analyze outgoing relationships for each hacker group
    this.graph.forEachDirectedEdge((edgeId, attrs, source, target) => {
      const group = hackerGroups.get(source);
      if (!group) return;

      const targetAttrs = this.graph.getNodeAttributes(target);
      
      switch (attrs.edgeType) {
        case 'attacks':
          group.totalAttackWeight += attrs.weight;
          group.attackCount++;
          group.targets.push({
            nodeId: target,
            label: targetAttrs.label,
            entityType: targetAttrs.entityType,
            weight: attrs.weight
          });
          
          const currentCount = group.targetsByType.get(targetAttrs.entityType) || 0;
          group.targetsByType.set(targetAttrs.entityType, currentCount + attrs.weight);
          break;
          
        case 'is_attributed_to':
          if (targetAttrs.entityType === 'Country' || targetAttrs.entityType === 'Government Body') {
            group.countryAssociations.push({
              nodeId: target,
              label: targetAttrs.label,
              relationshipType: attrs.edgeType,
              weight: attrs.weight
            });
          }
          break;
          
        case 'uses_infrastructure':
          if (['Software', 'Domain', 'Infrastructure', 'Device'].includes(targetAttrs.entityType)) {
            group.toolsUsed.push({
              nodeId: target,
              label: targetAttrs.label,
              entityType: targetAttrs.entityType,
              relationshipType: attrs.edgeType,
              weight: attrs.weight
            });
          }
          break;
          
        case 'collaborates_with':
          if (targetAttrs.entityType === 'HackerGroup') {
            group.collaborations.push({
              nodeId: target,
              label: targetAttrs.label,
              weight: attrs.weight
            });
          }
          break;
      }
    });

    // Convert to analysis results and sort by total attack weight
    const activeGroups: GroupAnalysisResult[] = Array.from(hackerGroups.values())
      .filter(group => group.totalAttackWeight > 0)
      .sort((a, b) => b.totalAttackWeight - a.totalAttackWeight)
      .slice(0, this.topN)
      .map((group, index) => {
        // Sort targets by weight
        group.targets.sort((a, b) => b.weight - a.weight);
        group.countryAssociations.sort((a, b) => b.weight - a.weight);
        group.toolsUsed.sort((a, b) => b.weight - a.weight);
        group.collaborations.sort((a, b) => b.weight - a.weight);

        // Create target distribution
        const targetDistribution = Array.from(group.targetsByType.entries())
          .map(([type, totalWeight]) => ({
            entityType: type,
            count: group.targets.filter(t => t.entityType === type).length,
            totalWeight
          }))
          .sort((a, b) => b.totalWeight - a.totalWeight);

        return {
          rank: index + 1,
          label: group.label,
          totalAttackWeight: group.totalAttackWeight,
          attackCount: group.attackCount,
          uniqueTargets: group.targets.length,
          riskScore: group.riskScore,
          firstSeen: group.firstSeenDate,
          
          topTargets: group.targets.slice(0, 5).map(t => ({
            label: t.label.substring(0, 30),
            type: t.entityType,
            weight: t.weight
          })),
          
          targetDistribution,
          
          countryLinks: group.countryAssociations.slice(0, 3).map(c => ({
            country: c.label.substring(0, 20),
            relationship: c.relationshipType,
            weight: c.weight
          })),
          
          mainTools: group.toolsUsed.slice(0, 5).map(t => ({
            tool: t.label.substring(0, 25),
            type: t.entityType,
            relationship: t.relationshipType,
            weight: t.weight
          })),
          
          partnerships: group.collaborations.slice(0, 3).map(p => ({
            partner: p.label.substring(0, 25),
            weight: p.weight
          }))
        };
      });

    // Calculate summary statistics
    const allGroups = Array.from(hackerGroups.values());
    const activeGroupsCount = allGroups.filter(g => g.totalAttackWeight > 0).length;
    const totalAttacks = allGroups.reduce((sum, g) => sum + g.totalAttackWeight, 0);
    
    const summary = {
      totalHackerGroups: hackerGroups.size,
      activeHackerGroups: activeGroupsCount,
      inactiveGroups: hackerGroups.size - activeGroupsCount,
      totalAttackWeight: totalAttacks,
      averageAttackWeight: activeGroupsCount > 0 ? parseFloat((totalAttacks / activeGroupsCount).toFixed(2)) : 0,
      topGroupAttackWeight: activeGroups.length > 0 ? activeGroups[0].totalAttackWeight : 0,
      groupsWithCountryLinks: activeGroups.filter(g => g.countryLinks.length > 0).length,
      groupsWithTools: activeGroups.filter(g => g.mainTools.length > 0).length,
      groupsWithPartnerships: activeGroups.filter(g => g.partnerships.length > 0).length
    };

    const sections: TableSection[] = [];

    // Add section for each active group
    activeGroups.forEach(group => {
      // Main group info table
      const insights = [];
      
      // Add top targets
      if (group.topTargets && group.topTargets.length > 0) {
        insights.push(['Top Target', group.topTargets[0].label, group.topTargets[0].type, group.topTargets[0].weight]);
        if (group.topTargets.length > 1) {
          insights.push(['', group.topTargets[1].label, group.topTargets[1].type, group.topTargets[1].weight]);
        }
      }
      
      // Add country attribution
      if (group.countryLinks && group.countryLinks.length > 0) {
        insights.push(['Attribution', group.countryLinks[0].country, group.countryLinks[0].relationship, group.countryLinks[0].weight]);
      }
      
      // Add main tool
      if (group.mainTools && group.mainTools.length > 0) {
        insights.push(['Main Tool', group.mainTools[0].tool, group.mainTools[0].type, group.mainTools[0].weight]);
      }
      
      // Add partnership
      if (group.partnerships && group.partnerships.length > 0) {
        insights.push(['Partner', group.partnerships[0].partner, 'HackerGroup', group.partnerships[0].weight]);
      }

      if (insights.length > 0) {
        sections.push({
          title: `${group.rank}. ${group.label} - Attack Weight: ${group.totalAttackWeight}, Targets: ${group.uniqueTargets}, Risk: ${group.riskScore}`,
          headers: ['Category', 'Entity', 'Type', 'Weight'],
          columnWidths: [12, 30, 18, 8],
          headerStyle: 'yellow',
          rows: insights
        });
      }
    });

    const output: AnalysisOutput = {
      summary: {
        title: 'KEY METRICS',
        metrics: [
          { label: 'totalHackerGroups', value: summary.totalHackerGroups },
          { label: 'activeHackerGroups', value: summary.activeHackerGroups },
          { label: 'totalAttackWeight', value: summary.totalAttackWeight },
          { label: 'topGroupAttackWeight', value: summary.topGroupAttackWeight },
          { label: 'groupsWithCountryLinks', value: summary.groupsWithCountryLinks },
          { label: 'groupsWithTools', value: summary.groupsWithTools }
        ]
      },
      sections
    };

    return {
      name: this.getName(),
      description: this.getDescription(),
      data: {
        summary,
        activeGroups,
        parameters: {
          topN: this.topN
        }
      },
      output
    };
  }
}