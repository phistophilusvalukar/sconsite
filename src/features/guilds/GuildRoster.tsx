import React from 'react';
import { Check, FileText, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Guild, GuildMembership } from '../../types/database';
import { DEFAULT_NPC_PLACEHOLDER, normalizeFoundryAvatar } from '../../utils/foundryCharacter';
import DynamicCharacterPortrait from '../characters/DynamicCharacterPortrait';

export type EditableGuildRole = Exclude<GuildMembership['roleCategory'], 'Leader'>;
export type GuildRoleEdit = { roleCategory: EditableGuildRole; roleTitle: string };

interface GuildRosterProps {
  guild: Guild;
  members: GuildMembership[];
  canEdit: boolean;
  getEdit: (member: GuildMembership) => GuildRoleEdit;
  updateEdit: (member: GuildMembership, update: Partial<GuildRoleEdit>) => void;
  saveEdit: (member: GuildMembership) => void;
}

const memberPortrait = (member: GuildMembership) =>
  normalizeFoundryAvatar(member.character?.stats?.avatar) || DEFAULT_NPC_PLACEHOLDER;

const GuildRoster: React.FC<GuildRosterProps> = ({ guild, members, canEdit, getEdit, updateEdit, saveEdit }) => {
  const editControls = (member: GuildMembership) => {
    if (!canEdit || member.roleCategory === 'Leader') return null;
    const edit = getEdit(member);
    return (
      <div className="guild-member-edit">
        <select value={edit.roleCategory} onChange={event => updateEdit(member, { roleCategory: event.target.value as EditableGuildRole })}>
          <option value="Subleader">{guild.roleLabels.Subleader}</option>
          <option value="Officer">{guild.roleLabels.Officer}</option>
          <option value="Member">{guild.roleLabels.Member}</option>
          <option value="Ally">{guild.roleLabels.Ally}</option>
        </select>
        <input value={edit.roleTitle} onChange={event => updateEdit(member, { roleTitle: event.target.value })} aria-label={`Title for ${member.character?.name || 'member'}`} />
        <button type="button" onClick={() => saveEdit(member)} aria-label="Save role"><Check size={16} /></button>
      </div>
    );
  };

  if (guild.rosterDisplay === 'ledger') {
    return (
      <div className="guild-ledger">
        <div className="guild-ledger-head"><span>Name entered</span><span>Station</span><span>Calling</span><span>Joined</span></div>
        {members.map(member => (
          <article className="guild-ledger-row" key={member._id}>
            <span className="guild-ledger-name"><i>{member.character?.name?.slice(0, 1).toUpperCase() || '?'}</i>{member.characterId ? <Link to={`/characters/${member.characterId}`}><strong>{member.character?.name || 'Unknown character'}</strong></Link> : <strong>{member.character?.name || 'Unknown character'}</strong>}</span>
            <span>{member.roleTitle || guild.roleLabels[member.roleCategory]}</span>
            <span>{member.character ? `Level ${member.character.level} ${member.character.class}` : 'Unrecorded'}</span>
            <span>{member.joinDate.toLocaleDateString()}</span>
            {editControls(member)}
          </article>
        ))}
      </div>
    );
  }

  if (guild.rosterDisplay === 'dossiers') {
    return (
      <div className="guild-dossier-grid">
        {members.map((member, index) => (
          <article className="guild-dossier" key={member._id} style={{ '--dossier-tilt': `${index % 2 === 0 ? '-.4deg' : '.45deg'}` } as React.CSSProperties}>
            <div className="guild-dossier-tab">FILE {String(index + 1).padStart(2, '0')}</div>
            <div className="guild-dossier-stamp">{member.roleCategory}</div>
            <DynamicCharacterPortrait character={member.character} fallbackSrc={memberPortrait(member)} alt={`${member.character?.name || 'Guild member'} portrait`} className="guild-dossier-portrait" motion="hover" />
            <div className="guild-dossier-copy">
              <small>{member.roleTitle || guild.roleLabels[member.roleCategory]}</small>
              <h3>{member.characterId ? <Link to={`/characters/${member.characterId}`}>{member.character?.name || 'Unknown character'}</Link> : member.character?.name || 'Unknown character'}</h3>
              <p>{member.character ? `${member.character.ancestry || member.character.race} · Level ${member.character.level} ${member.character.class}` : 'No character record available'}</p>
              <span><FileText size={13} /> Filed {member.joinDate.toLocaleDateString()}</span>
            </div>
            {editControls(member)}
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="guild-character-card-grid">
      {members.map(member => (
        <article className="guild-character-card" key={member._id}>
          <DynamicCharacterPortrait character={member.character} fallbackSrc={memberPortrait(member)} alt={`${member.character?.name || 'Guild member'} portrait`} className="guild-character-card-portrait" motion="hover" />
          <div className="guild-character-card-shade" />
          <div className="guild-character-card-role"><Shield size={13} /> {member.roleTitle || guild.roleLabels[member.roleCategory]}</div>
          <div className="guild-character-card-copy">
            <small>{member.character ? `Level ${member.character.level} · ${member.character.class}` : member.roleCategory}</small>
            <h3>{member.characterId ? <Link to={`/characters/${member.characterId}`}>{member.character?.name || 'Unknown character'}</Link> : member.character?.name || 'Unknown character'}</h3>
            <p>{[member.character?.heritage, member.character?.ancestry || member.character?.race].filter(Boolean).join(' ') || 'Adventurer'}</p>
          </div>
          {editControls(member)}
        </article>
      ))}
    </div>
  );
};

export default GuildRoster;
