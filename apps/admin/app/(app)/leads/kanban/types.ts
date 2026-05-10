import type { LeadStage } from '@uhs/db';

export type KanbanCard = {
  id: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  source: string;
  is_hot: boolean;
  assignee_id: string | null;
  home_id: string | null;
  created_at: string;
  updated_at: string;
  homes: { name: string; stock_no: string; listed_price_cents: number } | null;
};
