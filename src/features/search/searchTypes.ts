export interface SearchableDataset {
  id: string;
  name: string;
  badge: string;
  group: string;
  isAdded: boolean;
  add: () => Promise<void>;
}
