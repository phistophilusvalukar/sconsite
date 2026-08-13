import React from 'react';
import {
  getProfileDecorationStyle,
  profileDecorationCategories,
  profileDecorationThemes,
  type ProfileDecorationColorSource,
  type ProfileDecorationTheme
} from '../features/profiles/profileDecorations';
import './profileDecorationControls.css';

export interface ProfileDecorationSelection {
  borderTheme: ProfileDecorationTheme;
  backgroundTheme: ProfileDecorationTheme;
  borderColorSource: ProfileDecorationColorSource;
  backgroundColorSource: ProfileDecorationColorSource;
}

interface ProfileDecorationControlsProps {
  value: ProfileDecorationSelection;
  baseColor: string;
  accentColor: string;
  fontColor: string;
  onChange: (update: Partial<ProfileDecorationSelection>) => void;
}

const ThemeSelect: React.FC<{
  label: string;
  value: ProfileDecorationTheme;
  colorSource: ProfileDecorationColorSource;
  onThemeChange: (value: ProfileDecorationTheme) => void;
  onColorSourceChange: (value: ProfileDecorationColorSource) => void;
}> = ({ label, value, colorSource, onThemeChange, onColorSourceChange }) => {
  const selected = profileDecorationThemes.find(theme => theme.value === value) || profileDecorationThemes[0];
  return (
    <section className="profile-decoration-choice">
      <div><strong>{label}</strong><span>{selected.description}</span></div>
      <select value={value} onChange={event => onThemeChange(event.target.value as ProfileDecorationTheme)} aria-label={`${label} theme`}>
        {profileDecorationCategories.map(category => (
          <optgroup label={category} key={category}>
            {profileDecorationThemes.filter(theme => theme.category === category).map(theme => <option value={theme.value} key={theme.value}>{theme.label}</option>)}
          </optgroup>
        ))}
      </select>
      <div className="profile-decoration-source" aria-label={`${label} color source`}>
        <button type="button" className={colorSource === 'base' ? 'is-selected' : ''} onClick={() => onColorSourceChange('base')}>Page color</button>
        <button type="button" className={colorSource === 'accent' ? 'is-selected' : ''} onClick={() => onColorSourceChange('accent')}>Button color</button>
      </div>
    </section>
  );
};

const ProfileDecorationControls: React.FC<ProfileDecorationControlsProps> = ({ value, baseColor, accentColor, fontColor, onChange }) => {
  const borderColor = value.borderColorSource === 'base' ? baseColor : accentColor;
  const backgroundColor = value.backgroundColorSource === 'base' ? baseColor : accentColor;
  const previewStyle = getProfileDecorationStyle(value.borderTheme, value.backgroundTheme, borderColor, backgroundColor, fontColor);
  return (
    <div className="profile-decoration-controls">
      <div className={`profile-decoration-preview${value.borderTheme === 'none' ? '' : ' has-border'}${value.backgroundTheme === 'none' ? '' : ' has-background'}`} style={previewStyle}>
        <i /><div><span>Live motif</span><strong>{profileDecorationThemes.find(theme => theme.value === value.borderTheme)?.label} / {profileDecorationThemes.find(theme => theme.value === value.backgroundTheme)?.label}</strong></div>
      </div>
      <ThemeSelect
        label="Border"
        value={value.borderTheme}
        colorSource={value.borderColorSource}
        onThemeChange={borderTheme => onChange({ borderTheme })}
        onColorSourceChange={borderColorSource => onChange({ borderColorSource })}
      />
      <ThemeSelect
        label="Background"
        value={value.backgroundTheme}
        colorSource={value.backgroundColorSource}
        onThemeChange={backgroundTheme => onChange({ backgroundTheme })}
        onColorSourceChange={backgroundColorSource => onChange({ backgroundColorSource })}
      />
    </div>
  );
};

export default ProfileDecorationControls;
