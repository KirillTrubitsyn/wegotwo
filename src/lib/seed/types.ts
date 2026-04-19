export type SeedReport = {
  trip: { id: string; slug: string; created: boolean };
  destinations: number;
  days: number;
  events: number;
  flights: number;
  stays: number;
  expenses: number;
};
