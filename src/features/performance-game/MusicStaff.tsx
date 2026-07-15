import { ToneId } from './performanceGame.types';
import { getNoteX, getNoteY, toneById } from './performanceGame.utils';

interface MusicStaffProps {
  notes: ToneId[];
  activeIndex?: number;
  label?: string;
  hidden?: boolean;
}

const staffWidth = 620;
const lineStart = 26;
const lineEnd = 594;
const firstLineY = 50;
const lineGap = 12;

export const MusicStaff: React.FC<MusicStaffProps> = ({ notes, activeIndex, label, hidden = false }) => (
  <figure className={`performance-staff${hidden ? ' performance-staff-hidden' : ''}`} aria-label={label}>
    {label && <figcaption>{label}</figcaption>}
    <svg viewBox={`0 0 ${staffWidth} 126`} role="img" aria-hidden={hidden}>
      {[0, 1, 2, 3, 4].map(index => (
        <line
          key={index}
          x1={lineStart}
          x2={lineEnd}
          y1={firstLineY + index * lineGap}
          y2={firstLineY + index * lineGap}
          className="staff-line"
        />
      ))}
      {!hidden && notes.map((toneId, index) => {
        const tone = toneById[toneId];
        const isActive = index === activeIndex;
        return (
          <g
            key={`${toneId}-${index}`}
            className={`staff-note${isActive ? ' staff-note-active' : ''}`}
            transform={`translate(${getNoteX(index, notes.length, staffWidth)} ${getNoteY(tone.staffStep)})`}
            aria-label={`${tone.pitch} note ${index + 1}`}
          >
            <ellipse cx="0" cy="0" rx="13" ry="9" transform="rotate(-15)" />
            <line x1="11" y1="-3" x2="11" y2="-43" />
            <text x="0" y="28">{tone.label}</text>
          </g>
        );
      })}
    </svg>
  </figure>
);
