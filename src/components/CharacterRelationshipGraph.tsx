import React, { useMemo, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Character, CharacterRelationship, CharacterRelationshipType } from '../types/database';

type GraphFilter = 'all' | 'family' | 'guild' | 'ally' | 'selected';

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
}

const filterOptions: Array<{ id: GraphFilter; label: string }> = [
  { id: 'all', label: 'All relationships' },
  { id: 'family', label: 'Family only' },
  { id: 'guild', label: 'Same guild only' },
  { id: 'ally', label: 'Allies only' },
  { id: 'selected', label: 'Selected neighborhood' }
];

const CharacterRelationshipGraph: React.FC<CharacterRelationshipGraphProps> = ({
  characters,
  relationships,
  onSelectCharacter
}) => {
  const [filter, setFilter] = useState<GraphFilter>('selected');
  const [selectedCharacterId, setSelectedCharacterId] = useState(characters[0]?._id || '');
  const characterById = useMemo(() => new Map(characters.filter(character => character._id).map(character => [character._id as string, character])), [characters]);
  const graphVersion = useMemo(
    () => relationships.map(relationship => `${relationship.id}:${relationship.updatedAt}`).join('|'),
    [relationships]
  );
  const graphData = useMemo(
    () => buildGraphData(characters, relationships, filter, selectedCharacterId),
    [characters, relationships, filter, selectedCharacterId]
  );

  const selectedCharacter = selectedCharacterId ? characterById.get(selectedCharacterId) : undefined;

  if (characters.length === 0) {
    return (
      <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-8 text-center text-gray-300">
        No public characters are available for the relationship graph yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-fantasy text-2xl font-bold text-white">Relationships</h2>
          <p className="text-sm text-gray-400">
            {selectedCharacter ? `Selected: ${selectedCharacter.name}` : 'Select a character to focus the neighborhood.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(option => (
            <button
              key={option.id}
              onClick={() => setFilter(option.id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                filter === option.id
                  ? 'bg-yellow-500 text-midnight-900'
                  : 'bg-fantasy-800/50 text-gray-300 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="max-h-[560px] overflow-y-auto rounded-lg bg-midnight-900/60 p-3">
          {characters.map(character => (
            <button
              key={character._id}
              onClick={() => {
                setSelectedCharacterId(character._id || '');
                setFilter('selected');
              }}
              className={`mb-2 w-full rounded-lg p-3 text-left transition-colors ${
                selectedCharacterId === character._id
                  ? 'bg-yellow-500 text-midnight-900'
                  : 'bg-fantasy-900/50 text-gray-200 hover:bg-fantasy-800/70'
              }`}
            >
              <p className="font-semibold">{character.name}</p>
              <p className="text-xs opacity-80">Level {character.level} {character.class}</p>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-fantasy-700/30 bg-midnight-950">
          <ForceGraph2D<GraphNode, GraphLink>
            key={graphVersion}
            graphData={graphData}
            width={920}
            height={560}
            backgroundColor="#020617"
            nodeLabel={node => node.name}
            nodeColor={node => node.color}
            linkLabel={link => link.label}
            linkColor={link => link.color}
            linkWidth={link => Math.max(1, link.label.includes('official') ? 2.2 : 1.4)}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.5}
            onNodeClick={node => {
              setSelectedCharacterId(node.id);
              onSelectCharacter(node.character);
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = node.name;
              const fontSize = Math.max(10, 13 / globalScale);
              ctx.beginPath();
              ctx.arc(node.x || 0, node.y || 0, 6, 0, 2 * Math.PI, false);
              ctx.fillStyle = node.color;
              ctx.fill();
              ctx.font = `${fontSize}px Sans-Serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = '#f8fafc';
              ctx.fillText(label, node.x || 0, (node.y || 0) + 8);
            }}
          />
        </div>
      </div>
    </div>
  );
};

function buildGraphData(characters: Character[], relationships: CharacterRelationship[], filter: GraphFilter, selectedCharacterId: string) {
  const characterById = new Map(characters.filter(character => character._id).map(character => [character._id as string, character]));
  const filteredRelationships = filterRelationships(relationships, filter, selectedCharacterId);
  const nodeIds = new Set<string>();

  filteredRelationships.forEach(relationship => {
    if (characterById.has(relationship.sourceCharacterId)) nodeIds.add(relationship.sourceCharacterId);
    if (characterById.has(relationship.targetCharacterId)) nodeIds.add(relationship.targetCharacterId);
  });

  if (selectedCharacterId && characterById.has(selectedCharacterId)) nodeIds.add(selectedCharacterId);

  const nodes: GraphNode[] = Array.from(nodeIds).map(id => {
    const character = characterById.get(id) as Character;
    return {
      id,
      name: character.name,
      character,
      color: id === selectedCharacterId ? '#facc15' : '#a78bfa'
    };
  });

  const links: GraphLink[] = filteredRelationships
    .filter(relationship => nodeIds.has(relationship.sourceCharacterId) && nodeIds.has(relationship.targetCharacterId))
    .map(relationship => ({
      source: relationship.sourceCharacterId,
      target: relationship.targetCharacterId,
      label: describeRelationship(relationship, relationships),
      color: getRelationshipColor(relationship)
    }));

  return { nodes, links };
}

function filterRelationships(relationships: CharacterRelationship[], filter: GraphFilter, selectedCharacterId: string) {
  if (filter === 'family') return relationships.filter(relationship => relationship.relationshipTypes.includes('family'));
  if (filter === 'guild') return relationships.filter(relationship => relationship.relationshipTypes.includes('guildmate'));
  if (filter === 'ally') return relationships.filter(relationship => relationship.relationshipTypes.includes('ally'));
  if (filter !== 'selected' || !selectedCharacterId) return relationships;

  const direct = relationships.filter(relationship =>
    !relationship.relationshipTypes.includes('guildmate') &&
    !relationship.relationshipTypes.includes('ally') &&
    (relationship.sourceCharacterId === selectedCharacterId || relationship.targetCharacterId === selectedCharacterId)
  );
  const directIds = new Set(direct.flatMap(relationship => [relationship.sourceCharacterId, relationship.targetCharacterId]));
  const secondDegree = relationships.filter(relationship =>
    !relationship.relationshipTypes.includes('guildmate') &&
    !relationship.relationshipTypes.includes('ally') &&
    (directIds.has(relationship.sourceCharacterId) || directIds.has(relationship.targetCharacterId))
  );

  return dedupeRelationships([...direct, ...secondDegree]);
}

function dedupeRelationships(relationships: CharacterRelationship[]) {
  const byId = new Map<string, CharacterRelationship>();
  relationships.forEach(relationship => byId.set(relationship.id, relationship));
  return Array.from(byId.values());
}

function describeRelationship(relationship: CharacterRelationship, relationships: CharacterRelationship[]) {
  const labels = relationship.relationshipTypes.map(type => {
    const status = getRelationshipStatus(relationship, type, relationships);
    return `${formatRelationshipType(type)}${status === 'unofficial' ? ' unofficial' : ''}`;
  });
  return [labels.join(', '), relationship.subtype].filter(Boolean).join(' - ');
}

function getRelationshipStatus(relationship: CharacterRelationship, type: CharacterRelationshipType, relationships: CharacterRelationship[]) {
  if (relationship.isAutomatic || type === 'guildmate' || type === 'ally' || type === 'family') return 'official';

  const reciprocal = relationships.find(candidate =>
    candidate.sourceCharacterId === relationship.targetCharacterId &&
    candidate.targetCharacterId === relationship.sourceCharacterId
  );

  if (!reciprocal) return 'unofficial';
  if ((type === 'rival' || type === 'romantic') && reciprocal.relationshipTypes.includes(type)) return 'official';
  if (type === 'patron' && reciprocal.relationshipTypes.includes('owes_debt')) return 'official';
  if (type === 'owes_debt' && reciprocal.relationshipTypes.includes('patron')) return 'official';
  return 'unofficial';
}

function formatRelationshipType(type: CharacterRelationshipType) {
  return type.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function getRelationshipColor(relationship: CharacterRelationship) {
  if (relationship.relationshipTypes.includes('family')) return '#facc15';
  if (relationship.relationshipTypes.includes('guildmate')) return '#38bdf8';
  if (relationship.relationshipTypes.includes('ally')) return '#34d399';
  if (relationship.relationshipTypes.includes('romantic')) return '#fb7185';
  if (relationship.relationshipTypes.includes('rival')) return '#f97316';
  return '#c4b5fd';
}

export default CharacterRelationshipGraph;
