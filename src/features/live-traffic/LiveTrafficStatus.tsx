import { useEffect, useId, useState } from 'react';
import { SelectField } from '@/ui/Field';
import {
  describeAge,
  ROAD_DETAIL,
  ROAD_DETAIL_ORDER,
  type RoadDetail,
} from './trafficPresentation';
import type { LiveTrafficLayer } from './useLiveTraffic';
import './LiveTrafficStatus.css';

interface LiveTrafficStatusProps {
  layer: LiveTrafficLayer;
  roadDetail?: { value: RoadDetail; onChange: (detail: RoadDetail) => void };
}

function countLabel(layer: LiveTrafficLayer): string {
  const count = layer.count.toLocaleString('en-SG');
  if (layer.layer === 'congestion') return `${count} road links`;
  return `${count} ${layer.count === 1 ? 'incident' : 'incidents'}`;
}

export function LiveTrafficStatus({ layer, roadDetail }: LiveTrafficStatusProps) {
  const formId = useId();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const age = layer.fetchedAt ? describeAge(layer.fetchedAt, now) : null;

  return (
    <div className="live-traffic-status">
      {roadDetail && (
        <SelectField
          formId={formId}
          fieldId="road-detail"
          label="Roads shown"
          value={roadDetail.value}
          onChange={(event) => roadDetail.onChange(event.target.value as RoadDetail)}
        >
          {ROAD_DETAIL_ORDER.map((detail) => (
            <option key={detail} value={detail}>
              {ROAD_DETAIL[detail].label}
            </option>
          ))}
        </SelectField>
      )}
      <p
        className={
          age?.stale || layer.error
            ? 'live-traffic-status__note live-traffic-status__note--warning'
            : 'live-traffic-status__note'
        }
      >
        {age ? `${age.text} · ${countLabel(layer)}` : 'Waiting for the first reading from LTA…'}
        {layer.error && (
          <span className="live-traffic-status__error">Not updated: {layer.error}</span>
        )}
      </p>
    </div>
  );
}
