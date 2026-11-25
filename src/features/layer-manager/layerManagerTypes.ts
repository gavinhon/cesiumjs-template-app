import type { ReactNode } from 'react';
import type { LegendContent } from '@/lib/legendTypes';

export interface LayerEntry {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onZoomTo?: () => void;
  onRemove?: () => void;
  opacity?: { value: number; onChange: (value: number) => void };
  detail?: ReactNode;
  legend?: () => Promise<LegendContent | null>;
}

export interface BasemapChoice {
  options: { id: string; name: string; thumbnail?: { url: string; grayscale?: boolean } }[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export interface TerrainChoice {
  options: { id: string; name: string; attribution?: string }[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string | null) => void;
  onZoomTo: () => void;
}
