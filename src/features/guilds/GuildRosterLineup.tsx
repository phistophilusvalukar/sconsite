import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, Check, RotateCcw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { GuildMembership, GuildRosterLineupPlacement } from '../../types/database';
import { createDefaultGuildLineup, guildLineupCharacterId, isEligibleForGuildLineup } from './guildRosterLineupUtils';

interface GuildRosterLineupProps {
  members: GuildMembership[];
  placements: GuildRosterLineupPlacement[];
  editable?: boolean;
  onChange?: (placements: GuildRosterLineupPlacement[]) => void;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, Math.round(value)));

const GuildRosterLineup: React.FC<GuildRosterLineupProps> = ({ members, placements, editable = false, onChange }) => {
  const eligibleMembers = useMemo(() => members.filter(isEligibleForGuildLineup), [members]);
  const memberByCharacterId = useMemo(() => new Map(
    eligibleMembers.map(member => [guildLineupCharacterId(member), member])
  ), [eligibleMembers]);
  const visiblePlacements = placements.filter(placement => memberByCharacterId.has(placement.characterId));
  const [selectedId, setSelectedId] = useState('');
  const dragRef = useRef<{
    pointerId: number;
    characterId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    stageWidth: number;
    stageHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!editable) return;
    if (selectedId && visiblePlacements.some(placement => placement.characterId === selectedId)) return;
    setSelectedId(visiblePlacements[visiblePlacements.length - 1]?.characterId || '');
  }, [editable, selectedId, visiblePlacements]);

  const selectedPlacement = placements.find(placement => placement.characterId === selectedId);

  const updatePlacement = (characterId: string, update: Partial<GuildRosterLineupPlacement>) => {
    onChange?.(placements.map(placement => placement.characterId === characterId ? { ...placement, ...update } : placement));
  };

  const handlePointerDown = (placement: GuildRosterLineupPlacement, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) return;
    event.preventDefault();
    const stage = event.currentTarget.closest('.guild-lineup-stage');
    if (!(stage instanceof HTMLElement)) return;
    const bounds = stage.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      characterId: placement.characterId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: placement.x,
      startY: placement.y,
      stageWidth: Math.max(bounds.width, 1),
      stageHeight: Math.max(bounds.height, 1)
    };
    setSelectedId(placement.characterId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updatePlacement(drag.characterId, {
      x: clamp(drag.startX + ((event.clientX - drag.startClientX) / drag.stageWidth) * 100, 0, 100),
      y: clamp(drag.startY + ((event.clientY - drag.startClientY) / drag.stageHeight) * 100, -30, 40)
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const toggleMember = (member: GuildMembership) => {
    const characterId = guildLineupCharacterId(member);
    if (placements.some(placement => placement.characterId === characterId)) {
      onChange?.(placements.filter(placement => placement.characterId !== characterId));
      return;
    }
    if (placements.length >= 30) return;
    const next = [...placements, { characterId, x: 50, y: 0, scale: 100, rotation: 0 }];
    onChange?.(next);
    setSelectedId(characterId);
  };

  const moveLayer = (direction: -1 | 1) => {
    const index = placements.findIndex(placement => placement.characterId === selectedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= placements.length) return;
    const next = [...placements];
    [next[index], next[target]] = [next[target], next[index]];
    onChange?.(next);
  };

  if (!editable && visiblePlacements.length === 0) {
    return <div className="guild-lineup-empty"><Users size={25} /><strong>The company is assembling.</strong><span>No cutout portraits have been arranged yet.</span></div>;
  }

  return (
    <div className={`guild-lineup${editable ? ' is-editing' : ''}`}>
      <div className="guild-lineup-stage" aria-label={editable ? 'Class Photo arrangement canvas' : 'Guild Class Photo'}>
        <div className="guild-lineup-light" aria-hidden="true" />
        {visiblePlacements.map((placement, index) => {
          const member = memberByCharacterId.get(placement.characterId);
          if (!member?.character?.profilePortraitCutoutImageUrl) return null;
          const portrait = (
            <img
              src={member.character.profilePortraitCutoutImageUrl}
              alt=""
              draggable={false}
              onError={event => { event.currentTarget.style.visibility = 'hidden'; }}
            />
          );
          const style = {
            '--lineup-x': `${placement.x}%`,
            '--lineup-y': `${placement.y}%`,
            '--lineup-scale': placement.scale / 100,
            '--lineup-rotation': `${placement.rotation}deg`,
            '--lineup-delay': `${Math.min(index * 45, 650)}ms`,
            zIndex: index + 1
          } as React.CSSProperties;
          if (editable) {
            return (
              <button
                type="button"
                className={`guild-lineup-person${selectedId === placement.characterId ? ' is-selected' : ''}`}
                style={style}
                aria-label={`Move ${member.character.name}`}
                title={`Drag ${member.character.name} into position`}
                onPointerDown={event => handlePointerDown(placement, event)}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                key={placement.characterId}
              >
                {portrait}<span>{member.character.name}</span>
              </button>
            );
          }
          return (
            <Link
              className="guild-lineup-person"
              style={style}
              to={`/characters/${placement.characterId}`}
              aria-label={`View ${member.character.name}`}
              title={member.character.name}
              key={placement.characterId}
            >
              {portrait}<span>{member.character.name}</span>
            </Link>
          );
        })}
        {editable && visiblePlacements.length === 0 && <div className="guild-lineup-stage-empty"><Users /><strong>Select members below to begin the portrait.</strong></div>}
      </div>

      {editable && (
        <div className="guild-lineup-editor">
          <div className="guild-lineup-editor-heading">
            <div><strong>Class Photo cast</strong><small>Only members with an enabled transparent Dynamic Portrait cutout are available.</small></div>
            <button type="button" onClick={() => onChange?.(createDefaultGuildLineup(eligibleMembers))}><RotateCcw size={14} /> Arrange all</button>
          </div>
          {eligibleMembers.length > 0 ? (
            <div className="guild-lineup-cast">
              {eligibleMembers.map(member => {
                const characterId = guildLineupCharacterId(member);
                const included = placements.some(placement => placement.characterId === characterId);
                const atCapacity = !included && placements.length >= 30;
                return (
                  <button type="button" className={included ? 'is-included' : ''} onClick={() => toggleMember(member)} disabled={atCapacity} title={atCapacity ? 'Class Photos can include up to 30 characters.' : undefined} key={member._id}>
                    <span>{included ? <Check size={12} /> : '+'}</span>
                    <strong>{member.character?.name}</strong>
                    <small>{included ? 'In photo' : 'Add'}</small>
                  </button>
                );
              })}
            </div>
          ) : <p className="guild-lineup-no-members">No guild members have an enabled Dynamic Portrait cutout yet.</p>}

          {selectedPlacement && (
            <div className="guild-lineup-controls">
              <div className="guild-lineup-selected"><span>Editing</span><strong>{memberByCharacterId.get(selectedPlacement.characterId)?.character?.name}</strong><small>Drag the figure above or use these precise controls.</small></div>
              <label><span>Left / right</span><input type="range" min="0" max="100" value={selectedPlacement.x} onChange={event => updatePlacement(selectedPlacement.characterId, { x: Number(event.target.value) })} /><output>{selectedPlacement.x}%</output></label>
              <label><span>Up / down</span><input type="range" min="-30" max="40" value={selectedPlacement.y} onChange={event => updatePlacement(selectedPlacement.characterId, { y: Number(event.target.value) })} /><output>{selectedPlacement.y}%</output></label>
              <label><span>Size</span><input type="range" min="50" max="180" value={selectedPlacement.scale} onChange={event => updatePlacement(selectedPlacement.characterId, { scale: Number(event.target.value) })} /><output>{selectedPlacement.scale}%</output></label>
              <label><span>Tilt</span><input type="range" min="-12" max="12" value={selectedPlacement.rotation} onChange={event => updatePlacement(selectedPlacement.characterId, { rotation: Number(event.target.value) })} /><output>{selectedPlacement.rotation}°</output></label>
              <div className="guild-lineup-layer-controls">
                <button type="button" onClick={() => moveLayer(-1)} disabled={placements[0]?.characterId === selectedPlacement.characterId}><ArrowDown size={14} /> Send backward</button>
                <button type="button" onClick={() => moveLayer(1)} disabled={placements[placements.length - 1]?.characterId === selectedPlacement.characterId}><ArrowUp size={14} /> Bring forward</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GuildRosterLineup;
