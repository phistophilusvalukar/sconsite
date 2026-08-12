import React, { useEffect, useRef, useState } from 'react';
import type { Character } from '../../types/database';

type PortraitCharacter = Pick<
  Character,
  | 'name'
  | 'profileDynamicPortraitEnabled'
  | 'profilePortraitBackgroundImageUrl'
  | 'profilePortraitCutoutImageUrl'
  | 'profilePortraitFocusX'
  | 'profilePortraitFocusY'
>;

interface DynamicCharacterPortraitProps {
  character?: PortraitCharacter;
  fallbackSrc: string;
  alt: string;
  className?: string;
  motion?: 'parallax' | 'hover' | 'none';
  title?: string;
}

const hasDynamicCharacterPortrait = (character?: PortraitCharacter): boolean => Boolean(
  character?.profileDynamicPortraitEnabled
  && character.profilePortraitBackgroundImageUrl
  && character.profilePortraitCutoutImageUrl
);

const DynamicCharacterPortrait: React.FC<DynamicCharacterPortraitProps> = ({
  character,
  fallbackSrc,
  alt,
  className = '',
  motion = 'hover',
  title
}) => {
  const portraitRef = useRef<HTMLDivElement>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const isDynamic = hasDynamicCharacterPortrait(character) && !imageLoadFailed;

  useEffect(() => {
    setImageLoadFailed(false);
  }, [character?.profilePortraitBackgroundImageUrl, character?.profilePortraitCutoutImageUrl]);

  useEffect(() => {
    const portrait = portraitRef.current;
    if (!portrait || !isDynamic || motion !== 'parallax') return;

    let animationFrame = 0;
    const updateParallax = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const bounds = portrait.getBoundingClientRect();
        const viewportHeight = window.innerHeight || 1;
        const centerOffset = (bounds.top + bounds.height / 2 - viewportHeight / 2) / (viewportHeight + bounds.height);
        const normalizedOffset = Math.max(-1, Math.min(1, centerOffset * 2));
        const backgroundTravel = Math.min(32, bounds.height * 0.05);
        const cutoutTravel = Math.min(56, bounds.height * 0.08);
        portrait.style.setProperty('--portrait-background-scroll', `${normalizedOffset * -backgroundTravel}px`);
        portrait.style.setProperty('--portrait-cutout-scroll', `${normalizedOffset * cutoutTravel}px`);
      });
    };

    updateParallax();
    window.addEventListener('scroll', updateParallax, { passive: true });
    window.addEventListener('resize', updateParallax);
    return () => {
      window.removeEventListener('scroll', updateParallax);
      window.removeEventListener('resize', updateParallax);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [isDynamic, motion]);

  if (!isDynamic || !character) {
    return <img src={fallbackSrc} alt={alt} title={title} className={className} />;
  }

  const portraitStyle = {
    '--portrait-focus-x': `${character.profilePortraitFocusX ?? 50}%`,
    '--portrait-focus-y': `${character.profilePortraitFocusY ?? 0}%`
  } as React.CSSProperties;

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (motion === 'none') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty('--portrait-tilt-x', `${vertical * -24}deg`);
    event.currentTarget.style.setProperty('--portrait-tilt-y', `${horizontal * 28}deg`);
    event.currentTarget.style.setProperty('--portrait-background-x', `${horizontal * -10}px`);
    event.currentTarget.style.setProperty('--portrait-background-y', `${vertical * -7}px`);
    event.currentTarget.style.setProperty('--portrait-background-tilt-x', `${vertical * 7}deg`);
    event.currentTarget.style.setProperty('--portrait-background-tilt-y', `${horizontal * -9}deg`);
    event.currentTarget.style.setProperty('--portrait-cutout-x', `${horizontal * 18}px`);
    event.currentTarget.style.setProperty('--portrait-cutout-y', `${vertical * 12}px`);
    event.currentTarget.style.setProperty('--portrait-cutout-tilt-x', `${vertical * -9}deg`);
    event.currentTarget.style.setProperty('--portrait-cutout-tilt-y', `${horizontal * 11}deg`);
    event.currentTarget.style.setProperty('--portrait-glint-x', `${horizontal * 44}px`);
  };

  const resetPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--portrait-tilt-x', '0deg');
    event.currentTarget.style.setProperty('--portrait-tilt-y', '0deg');
    event.currentTarget.style.setProperty('--portrait-background-x', '0px');
    event.currentTarget.style.setProperty('--portrait-background-y', '0px');
    event.currentTarget.style.setProperty('--portrait-background-tilt-x', '0deg');
    event.currentTarget.style.setProperty('--portrait-background-tilt-y', '0deg');
    event.currentTarget.style.setProperty('--portrait-cutout-x', '0px');
    event.currentTarget.style.setProperty('--portrait-cutout-y', '0px');
    event.currentTarget.style.setProperty('--portrait-cutout-tilt-x', '0deg');
    event.currentTarget.style.setProperty('--portrait-cutout-tilt-y', '0deg');
    event.currentTarget.style.setProperty('--portrait-glint-x', '0px');
  };

  return (
    <div
      ref={portraitRef}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      title={title}
      style={portraitStyle}
      className={`dynamic-character-portrait dynamic-character-portrait-${motion} ${className}`.trim()}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      onPointerCancel={resetPointer}
    >
      <img
        aria-hidden="true"
        className="dynamic-character-portrait-background"
        src={character.profilePortraitBackgroundImageUrl}
        alt=""
        draggable={false}
        onError={() => setImageLoadFailed(true)}
      />
      <div className="dynamic-character-portrait-depth" aria-hidden="true" />
      <img
        aria-hidden="true"
        className="dynamic-character-portrait-cutout"
        src={character.profilePortraitCutoutImageUrl}
        alt=""
        draggable={false}
        onError={() => setImageLoadFailed(true)}
      />
      <div className="dynamic-character-portrait-glint" aria-hidden="true" />
    </div>
  );
};

export default DynamicCharacterPortrait;
