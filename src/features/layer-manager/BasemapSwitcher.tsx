import { useEffect, useRef, useState } from 'react';
import type { BasemapChoice } from './layerManagerTypes';
import './BasemapSwitcher.css';

interface BasemapSwitcherProps {
  basemap: BasemapChoice;
}

export function BasemapSwitcher({ basemap }: BasemapSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = basemap.options.find((option) => option.id === basemap.selectedId);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div ref={rootRef} className="basemap-switcher">
      <button
        type="button"
        className={
          open ? 'basemap-switcher__tile basemap-switcher__tile--open' : 'basemap-switcher__tile'
        }
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="basemap-switcher-options"
        aria-label={`Basemap: ${current.name}. Choose another`}
        title={`Basemap: ${current.name}`}
      >
        <Thumbnail option={current} />
        <span className="basemap-switcher__caption">Basemap</span>
      </button>

      {open && (
        <div
          id="basemap-switcher-options"
          className="control basemap-switcher__options"
          role="radiogroup"
          aria-label="Basemap"
        >
          {basemap.options.map((option) => {
            const selected = option.id === basemap.selectedId;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={
                  selected
                    ? 'basemap-switcher__option basemap-switcher__option--selected'
                    : 'basemap-switcher__option'
                }
                onClick={() => {
                  basemap.onSelect(option.id);
                  setOpen(false);
                }}
              >
                <Thumbnail option={option} />
                <span className="basemap-switcher__name">{option.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Thumbnail({ option }: { option: BasemapChoice['options'][number] }) {
  const [failed, setFailed] = useState(false);
  if (!option.thumbnail || failed) return <span className="basemap-switcher__image" />;
  return (
    <img
      className={
        option.thumbnail.grayscale
          ? 'basemap-switcher__image basemap-switcher__image--grayscale'
          : 'basemap-switcher__image'
      }
      src={option.thumbnail.url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
