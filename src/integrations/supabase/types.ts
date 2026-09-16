export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          id: string
          name: string | null
          password: string
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          password: string
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          password?: string
          phone?: string
        }
        Relationships: []
      }
      creator_leads: {
        Row: {
          activity_level: string | null
          campaign: string
          created_at: string
          creator: string
          goal: string | null
          id: string
          name: string
          phone: string
          source: string | null
        }
        Insert: {
          activity_level?: string | null
          campaign: string
          created_at?: string
          creator: string
          goal?: string | null
          id?: string
          name: string
          phone: string
          source?: string | null
        }
        Update: {
          activity_level?: string | null
          campaign?: string
          created_at?: string
          creator?: string
          goal?: string | null
          id?: string
          name?: string
          phone?: string
          source?: string | null
        }
        Relationships: []
      }
      b2b_leads: {
        Row: {
          company: string | null
          contact_name: string
          created_at: string
          email: string | null
          event_type: string | null
          headcount: string | null
          id: string
          message: string | null
          phone: string
        }
        Insert: {
          company?: string | null
          contact_name: string
          created_at?: string
          email?: string | null
          event_type?: string | null
          headcount?: string | null
          id?: string
          message?: string | null
          phone: string
        }
        Update: {
          company?: string | null
          contact_name?: string
          created_at?: string
          email?: string | null
          event_type?: string | null
          headcount?: string | null
          id?: string
          message?: string | null
          phone?: string
        }
        Relationships: []
      }
      billing_history: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string | null
          payment_date: string
          type: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string | null
          payment_date: string
          type?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string | null
          payment_date?: string
          type?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comp_classes: {
        Row: {
          class_date: string
          client_id: string
          created_at: string
          id: string
          notes: string | null
          trainer_id: string | null
        }
        Insert: {
          class_date: string
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          trainer_id?: string | null
        }
        Update: {
          class_date?: string
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          trainer_id?: string | null
        }
        Relationships: []
      }
      daily_tips: {
        Row: {
          active: boolean
          created_at: string
          id: string
          sort_order: number
          text: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          sort_order?: number
          text: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          sort_order?: number
          text?: string
        }
        Relationships: []
      }
      health_reports: {
        Row: {
          client_id: string
          created_at: string
          file_path: string | null
          id: string
          report_date: string
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          file_path?: string | null
          id?: string
          report_date: string
          title: string
        }
        Update: {
          client_id?: string
          created_at?: string
          file_path?: string | null
          id?: string
          report_date?: string
          title?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          id: string
          interest: string
          name: string
          phone: string
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          interest: string
          name: string
          phone: string
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          interest?: string
          name?: string
          phone?: string
          source?: string | null
        }
        Relationships: []
      }
      marketing_posts: {
        Row: {
          active: boolean
          caption: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          id: string
          media_path: string
          media_type: string
        }
        Insert: {
          active?: boolean
          caption?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          media_path: string
          media_type?: string
        }
        Update: {
          active?: boolean
          caption?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          media_path?: string
          media_type?: string
        }
        Relationships: []
      }
      pauses: {
        Row: {
          client_id: string | null
          created_at: string
          from_date: string
          id: string
          status: Database["public"]["Enums"]["pause_status"]
          to_date: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          from_date: string
          id?: string
          status?: Database["public"]["Enums"]["pause_status"]
          to_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_date?: string
          id?: string
          status?: Database["public"]["Enums"]["pause_status"]
          to_date?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_trainers: {
        Row: {
          contact: string | null
          created_at: string
          email: string
          id: string
          name: string
          password: string
          user_id: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          password: string
          user_id: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          password?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_options: {
        Row: {
          active: boolean
          badge: string | null
          created_at: string
          duration_months: number
          id: string
          name: string
          price: number
          sort_order: number
          total_sessions: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          created_at?: string
          duration_months: number
          id?: string
          name: string
          price: number
          sort_order?: number
          total_sessions?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          created_at?: string
          duration_months?: number
          id?: string
          name?: string
          price?: number
          sort_order?: number
          total_sessions?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      plan_price_overrides: {
        Row: {
          created_at: string
          id: string
          plan_option_id: string
          price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_option_id: string
          price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_option_id?: string
          price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_price_overrides_plan_option_id_fkey"
            columns: ["plan_option_id"]
            isOneToOne: false
            referencedRelation: "plan_options"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          amount: number
          auto_renew: boolean
          created_at: string
          discount: number
          end_date: string
          id: string
          payment_method: string | null
          renewal_date: string
          start_date: string
          status: Database["public"]["Enums"]["plan_status"]
          total_sessions: number
          training_days: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          auto_renew?: boolean
          created_at?: string
          discount?: number
          end_date: string
          id?: string
          payment_method?: string | null
          renewal_date: string
          start_date: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_sessions: number
          training_days: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          auto_renew?: boolean
          created_at?: string
          discount?: number
          end_date?: string
          id?: string
          payment_method?: string | null
          renewal_date?: string
          start_date?: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_sessions?: number
          training_days?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          dob: string | null
          email: string | null
          full_name: string | null
          id: string
          name: string | null
          phone: string | null
          society: string | null
          society_id: string | null
          time_slot: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          name?: string | null
          phone?: string | null
          society?: string | null
          society_id?: string | null
          time_slot?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          society?: string | null
          society_id?: string | null
          time_slot?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      societies: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          status: string
          title: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trainer_session_adjustments: {
        Row: {
          created_at: string
          delta: number
          id: string
          month: string
          notes: string | null
          trainer_id: string
        }
        Insert: {
          created_at?: string
          delta?: number
          id?: string
          month: string
          notes?: string | null
          trainer_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          month?: string
          notes?: string | null
          trainer_id?: string
        }
        Relationships: []
      }
      trainer_slots: {
        Row: {
          created_at: string
          id: string
          society_id: string
          time_slot: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          society_id: string
          time_slot: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          society_id?: string
          time_slot?: string
          trainer_id?: string
        }
        Relationships: []
      }
      trainer_societies: {
        Row: {
          created_at: string
          society_id: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          society_id: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          society_id?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_societies_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_societies_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_off_times: {
        Row: {
          created_at: string
          from_date: string
          id: string
          reason: string | null
          time_slot: string | null
          to_date: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          from_date: string
          id?: string
          reason?: string | null
          time_slot?: string | null
          to_date: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          from_date?: string
          id?: string
          reason?: string | null
          time_slot?: string | null
          to_date?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_off_times_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          active: boolean
          contact: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          password: string | null
          specialization: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          password?: string | null
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          password?: string | null
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_trainer: {
        Args: {
          p_email: string
          p_name: string
          p_password: string
          p_user_id: string
          p_contact?: string | null
        }
        Returns: undefined
      }
      reject_trainer: {
        Args: {
          p_user_id: string
        }
        Returns: undefined
      }
      get_trainer_clients: {
        Args: {
          _trainer_id?: string | null
        }
        Returns: {
          end_date: string | null
          id: string
          is_paused_today: boolean | null
          name: string | null
          phone: string | null
          society_id: string | null
          time_slot: string | null
          training_days: string[] | null
        }[]
      }
      get_my_society_batches: {
        Args: never
        Returns: {
          member_count: number
          society_id: string
          society_name: string
          time_slot: string
          trainer_id: string
          trainer_name: string
        }[]
      }
      get_trainer_client_pauses: {
        Args: never
        Returns: {
          client_id: string
          client_name: string
          from_date: string
          pause_id: string
          society: string
          status: Database["public"]["Enums"]["pause_status"]
          time_slot: string
          to_date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "client" | "trainer" | "admin"
      pause_status: "active" | "completed"
      plan_status: "active" | "paused" | "cancelled" | "completed"
      plan_type: "1-month" | "3-month" | "6-month"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["client", "trainer", "admin"],
      pause_status: ["active", "completed"],
      plan_status: ["active", "paused", "cancelled", "completed"],
      plan_type: ["1-month", "3-month", "6-month"],
    },
  },
} as const
