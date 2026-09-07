export interface Transaction {
  id: string;
  title: string;
  date: string;
  amount: number;
  currency: 'INR' | 'XP';
  type: 'earn' | 'spend' | 'convert' | 'withdraw' | 'topup';
  status?: string;
  /** epoch ms of createdAt — used for sorting and month grouping */
  ts?: number;
}