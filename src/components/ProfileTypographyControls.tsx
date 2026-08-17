import React from 'react';
import type { ProfileFontFamily } from '../types/database';
import './profileTypographyControls.css';

export interface ProfileTypographySelection {
  titleFontFamily: ProfileFontFamily;
  subtitleFontFamily: ProfileFontFamily;
  fontFamily: ProfileFontFamily;
  accentFontFamily: ProfileFontFamily;
  titleFontSize: number;
  subtitleFontSize: number;
  textFontSize: number;
  accentFontSize: number;
}

interface FontOption {
  value: ProfileFontFamily;
  label: string;
  stack: string;
  category: string;
}

interface ProfileTypographyControlsProps {
  value: ProfileTypographySelection;
  fontOptions: readonly FontOption[];
  categories: readonly string[];
  onChange: (update: Partial<ProfileTypographySelection>) => void;
}

const roles = [
  { fontKey: 'titleFontFamily', sizeKey: 'titleFontSize', label: 'Main title', preview: 'A Legendary Name', min: 40, max: 180 },
  { fontKey: 'subtitleFontFamily', sizeKey: 'subtitleFontSize', label: 'Subtitles & headings', preview: 'Chronicles and company', min: 14, max: 56 },
  { fontKey: 'fontFamily', sizeKey: 'textFontSize', label: 'Normal text', preview: 'Readable stories, details, and records.', min: 12, max: 26 },
  { fontKey: 'accentFontFamily', sizeKey: 'accentFontSize', label: 'Buttons & accents', preview: 'Actions, tabs, labels, and badges', min: 10, max: 28 }
] as const;

const ProfileTypographyControls: React.FC<ProfileTypographyControlsProps> = ({ value, fontOptions, categories, onChange }) => (
  <div className="profile-typography-controls">
    {roles.map(role => {
      const fontValue = value[role.fontKey];
      const sizeValue = value[role.sizeKey];
      const fontStack = fontOptions.find(option => option.value === fontValue)?.stack || fontOptions[0]?.stack;
      return (
        <section className="profile-typography-role" key={role.fontKey}>
          <div className="profile-typography-role-heading">
            <span>{role.label}</span>
            <output>{sizeValue}px</output>
          </div>
          <p style={{ fontFamily: fontStack, fontSize: `${Math.min(sizeValue, role.fontKey === 'titleFontFamily' ? 34 : role.fontKey === 'subtitleFontFamily' ? 24 : 18)}px` }}>{role.preview}</p>
          <label>
            <span>Font</span>
            <select value={fontValue} style={{ fontFamily: fontStack }} onChange={event => onChange({ [role.fontKey]: event.target.value as ProfileFontFamily })}>
              {categories.map(category => (
                <optgroup label={category} key={category}>
                  {fontOptions.filter(option => option.category === category).map(option => (
                    <option value={option.value} key={option.value} style={{ fontFamily: option.stack }}>
                      {option.label} — Aa Bb Cc
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span>Size</span>
            <input type="range" min={role.min} max={role.max} step="1" value={sizeValue} onChange={event => onChange({ [role.sizeKey]: Number(event.target.value) })} />
          </label>
        </section>
      );
    })}
  </div>
);

export default ProfileTypographyControls;
