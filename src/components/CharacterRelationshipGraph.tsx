import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
  getRelationshipColor,
  getRelationshipSentimentCategory
} from '../features/characters/relationshipSentiment';
import type {
  Character,
  CharacterRelationship,
  CharacterRelationshipSentiment
} from '../types/database';

interface CharacterRelationshipGraphProps {
  characters: Character[];
  relationships: CharacterRelationship[];
  onSelectCharacter: (character: Character) => void;
}

interface GraphNode {
  id: string;
  name: string;
  character: Character;
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  color: string;
  sentiment: number;
}

const sentimentOptions: Array<{ id: CharacterRelationshipSentiment; label: string; color: string }> = [
  { id: 'negative', label: 'Negative', color: getRelationshipColor(-100) },
  { id: 'neutral', label: 'Neutral', color: getRelationshipColor(0) },
  { id: 'positive', label: 'Positive', color: getRelationshipColor(100) }
];

const CharacterRelationshipGraph: React.FC<CharacterRelationshipGraphProps> = ({
  characters,
  relationships,
  onSelectCharacter
}) => {
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(900);
  const [visibleSentiments, setVisibleSentiments] = useState<Record<CharacterRelationshipSentiment, boolean>>({
    negative: true,
    neutral: true,
    positive: true
  });

  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container) return;

    const updateWidth = () => setGraphWidth(Math.max(280, Math.floor(container.getBoundingClientRect().width)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const confirmedRelationships = useMemo(
    () => relationships.filter(relationship => relationship.status === 'confirmed'),
    [relationships]
  );
  const graphData = useMemo(
    () => buildGraphData(characters, confirmedRelationships, visibleSentiments),
    [characters, confirmedRelationships, visibleSentiments]
  );
  const graphVersion = useMemo(
    () => graphData.links.map(link => `${link.source}:${link.target}:${link.sentiment}`).join('|'),
    [graphData.links]
  );

  if (characters.length === 0) {
    return (
      <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-8 text-center text-gray-300">
        No public characters are available for the relationship map yet.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.24em] text-stone-400">The social web</p>
          <h2 className="font-fantasy text-2xl font-bold text-white">Confirmed relationships</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Every line has been approved by both characters. Select which parts of the sentiment spectrum you want to see.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Relationship sentiment filters">
          {sentimentOptions.map(option => {
            const isVisible = visibleSentiments[option.id];
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isVisible}
                onClick={() => setVisibleSentiments(current => ({ ...current, [option.id]: !current[option.id] }))}
                className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-all ${
                  isVisible
                    ? 'border-white/25 bg-white/10 text-white shadow-sm'
                    : 'border-white/10 bg-black/10 text-gray-500 opacity-60'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={graphContainerRef} className="relative min-h-[560px] overflow-hidden rounded-xl border border-white/10 bg-[#11100f]">
        {graphData.links.length === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-8 text-center text-sm text-stone-400">
            No confirmed relationships match the selected sentiment filters.
          </div>
        ) : null}
        <ForceGraph2D<GraphNode, GraphLink>
          key={graphVersion}
          graphData={graphData}
          width={graphWidth}
          height={560}
          backgroundColor="#11100f"
          nodeLabel={node => node.name}
          nodeColor={node => node.color}
          linkLabel={link => link.label}
          linkColor={link => link.color}
          linkWidth={link => 1.8 + (Math.abs(link.sentiment) / 100) * 2.2}
          onNodeClick={node => onSelectCharacter(node.character)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const fontSize = Math.max(10, 13 / globalScale);
            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, 6, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color;
            ctx.fill();
            ctx.font = `600 ${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#f5f5f4';
            ctx.fillText(node.name, node.x || 0, (node.y || 0) + 9);
          }}
        />
      </div>
    </section>
  );
};

function buildGraphData(
  characters: Character[],
  relationships: CharacterRelationship[],
  visibleSentiments: Record<CharacterRelationshipSentiment, boolean>
) {
  const characterById = new Map(
    characters.filter(character => character._id).map(character => [character._id as string, character])
  );
  const visibleRelationships = relationships.filter(relationship => (
    visibleSentiments[getRelationshipSentimentCategory(relationship.sentiment)]
    && characterById.has(relationship.sourceCharacterId)
    && characterById.has(relationship.targetCharacterId)
  ));
  const nodeIds = new Set(visibleRelationships.flatMap(relationship => [
    relationship.sourceCharacterId,
    relationship.targetCharacterId
  ]));

  const nodes: GraphNode[] = Array.from(nodeIds).map(id => {
    const character = characterById.get(id) as Character;
    return {
      id,
      name: character.name,
      character,
      color: '#c4b5a5'
    };
  });

  const links: GraphLink[] = visibleRelationships.map(relationship => ({
    source: relationship.sourceCharacterId,
    target: relationship.targetCharacterId,
    label: [relationship.name, relationship.tag].filter(Boolean).join(' · '),
    color: getRelationshipColor(relationship.sentiment),
    sentiment: relationship.sentiment
  }));

  return { nodes, links };
}

export default CharacterRelationshipGraph;
