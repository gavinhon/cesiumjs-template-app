declare module 'virtual:public-datasets' {
  import type { PublicDataset } from '@/lib/publicDatasetTypes';

  const datasets: PublicDataset[];
  export default datasets;
}
