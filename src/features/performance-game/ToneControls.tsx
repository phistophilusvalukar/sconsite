import { ToneId, TONES } from './performanceGame.types';

interface ToneControlsProps {
  disabled: boolean;
  activeToneId?: ToneId;
  onTone: (toneId: ToneId) => void;
}

export const ToneControls: React.FC<ToneControlsProps> = ({ disabled, activeToneId, onTone }) => (
  <div className="tone-control-grid" role="group" aria-label="Performance note controls">
    {TONES.map((tone, index) => (
      <button
        key={tone.id}
        type="button"
        className={`tone-control${activeToneId === tone.id ? ' tone-control-active' : ''}`}
        disabled={disabled}
        onClick={() => onTone(tone.id)}
        aria-label={`Play ${index === 0 ? 'low' : index === TONES.length - 1 ? 'high' : 'middle'} note ${tone.pitch}`}
      >
        <span className="tone-key">{tone.label}</span>
        <span className="tone-pitch">{tone.pitch}</span>
        <span className="tone-range">{index === 0 ? 'low' : index === TONES.length - 1 ? 'high' : '\u00a0'}</span>
      </button>
    ))}
  </div>
);
