export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      holdings: {
        Row: {
          id: string;
          user_id: string;
          statement_date: string;
          isin: string;
          name: string;
          ticker: string | null;
          shares: number;
          price_eur: number;
          market_value_eur: number;
          depot: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["holdings"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["holdings"]["Insert"]>;
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          isin: string | null;
          name: string;
          direction: string;
          shares: number | null;
          price_eur: number | null;
          amount_eur: number;
          approx: boolean;
          tx_type: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["transactions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
      };
      targets: {
        Row: {
          id: string;
          user_id: string;
          isin: string;
          target_weight: number;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["targets"]["Row"], "id" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["targets"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
