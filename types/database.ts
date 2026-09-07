export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      lead_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipelines: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          pipeline_id: string
          position: number
          probability: number
          stage_type: Database["public"]["Enums"]["pipeline_stage_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          pipeline_id: string
          position: number
          probability?: number
          stage_type: Database["public"]["Enums"]["pipeline_stage_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          pipeline_id?: string
          position?: number
          probability?: number
          stage_type?: Database["public"]["Enums"]["pipeline_stage_type"]
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          campaign: string | null
          city: string | null
          company: string | null
          created_at: string
          email: string | null
          estimated_value: number | null
          id: string
          instagram: string | null
          invests_paid_traffic: boolean | null
          last_intake_at: string | null
          lead_source_id: string | null
          lost_note: string | null
          lost_reason_id: string | null
          name: string
          next_action: string | null
          next_action_at: string | null
          note: string | null
          organization_id: string
          owner_id: string | null
          pipeline_id: string | null
          revenue_range: string | null
          segment: string | null
          service_interest: string | null
          stage_id: string | null
          state: string | null
          temperature: Database["public"]["Enums"]["lead_temperature"] | null
          updated_at: string
          website: string | null
          whatsapp: string | null
          whatsapp_normalized: string | null
        }
        Insert: {
          campaign?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          id?: string
          instagram?: string | null
          invests_paid_traffic?: boolean | null
          last_intake_at?: string | null
          lead_source_id?: string | null
          lost_note?: string | null
          lost_reason_id?: string | null
          name: string
          next_action?: string | null
          next_action_at?: string | null
          note?: string | null
          organization_id: string
          owner_id?: string | null
          pipeline_id?: string | null
          revenue_range?: string | null
          segment?: string | null
          service_interest?: string | null
          stage_id?: string | null
          state?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Update: {
          campaign?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          id?: string
          instagram?: string | null
          invests_paid_traffic?: boolean | null
          last_intake_at?: string | null
          lead_source_id?: string | null
          lost_note?: string | null
          lost_reason_id?: string | null
          name?: string
          next_action?: string | null
          next_action_at?: string | null
          note?: string | null
          organization_id?: string
          owner_id?: string | null
          pipeline_id?: string | null
          revenue_range?: string | null
          segment?: string | null
          service_interest?: string | null
          stage_id?: string | null
          state?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_same_organization"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "leads_source_same_organization"
            columns: ["lead_source_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_pipeline_id: string | null
          from_position: number | null
          from_stage_id: string | null
          id: string
          lead_id: string
          organization_id: string
          to_pipeline_id: string
          to_position: number
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_pipeline_id?: string | null
          from_position?: number | null
          from_stage_id?: string | null
          id?: string
          lead_id: string
          organization_id: string
          to_pipeline_id: string
          to_position: number
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_pipeline_id?: string | null
          from_position?: number | null
          from_stage_id?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          to_pipeline_id?: string
          to_position?: number
          to_stage_id?: string
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          active: boolean
          created_at: string
          default_lead_source_id: string | null
          id: string
          organization_id: string
          slug: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_lead_source_id?: string | null
          id?: string
          organization_id: string
          slug: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_lead_source_id?: string | null
          id?: string
          organization_id?: string
          slug?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_submissions: {
        Row: {
          created_at: string
          external_submission_id: string
          id: string
          integration_credential_id: string
          is_new_lead: boolean
          lead_id: string
          organization_id: string
          raw_payload: Json
        }
        Insert: {
          created_at?: string
          external_submission_id: string
          id?: string
          integration_credential_id: string
          is_new_lead: boolean
          lead_id: string
          organization_id: string
          raw_payload: Json
        }
        Update: {
          created_at?: string
          external_submission_id?: string
          id?: string
          integration_credential_id?: string
          is_new_lead?: boolean
          lead_id?: string
          organization_id?: string
          raw_payload?: Json
        }
        Relationships: []
      }
      lead_attribution: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          created_at: string
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gbraid: string | null
          gclid: string | null
          id: string
          landing_page: string | null
          organization_id: string
          referrer: string | null
          submission_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          wbraid: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          organization_id: string
          referrer?: string | null
          submission_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          organization_id?: string
          referrer?: string | null
          submission_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          closed_at: string
          closed_by: string | null
          created_at: string
          id: string
          lead_id: string
          mrr: number | null
          note: string | null
          organization_id: string
          tcv: number | null
          updated_at: string
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          created_at?: string
          id?: string
          lead_id: string
          mrr?: number | null
          note?: string | null
          organization_id: string
          tcv?: number | null
          updated_at?: string
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          mrr?: number | null
          note?: string | null
          organization_id?: string
          tcv?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_integrations: {
        Row: {
          active: boolean
          conversion_value_mode: Database["public"]["Enums"]["meta_conversion_value_mode"]
          created_at: string
          id: string
          organization_id: string
          pixel_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          conversion_value_mode?: Database["public"]["Enums"]["meta_conversion_value_mode"]
          created_at?: string
          id?: string
          organization_id: string
          pixel_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          conversion_value_mode?: Database["public"]["Enums"]["meta_conversion_value_mode"]
          created_at?: string
          id?: string
          organization_id?: string
          pixel_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_integration_secrets: {
        Row: {
          access_token_encrypted: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversion_events: {
        Row: {
          attempts: number
          created_at: string
          deal_id: string
          event_name: string
          id: string
          last_error: string | null
          meta_event_id: string | null
          organization_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["conversion_event_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          deal_id: string
          event_name?: string
          id?: string
          last_error?: string | null
          meta_event_id?: string | null
          organization_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["conversion_event_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          deal_id?: string
          event_name?: string
          id?: string
          last_error?: string | null
          meta_event_id?: string | null
          organization_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["conversion_event_status"]
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id: string
          name: string
          organization_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_profile_organization_id: { Args: never; Returns: string }
      move_lead_to_stage: {
        Args: { p_lead_id: string; p_target_stage_id: string }
        Returns: Database["public"]["Tables"]["leads"]["Row"]
      }
      create_lead_with_pipeline: {
        Args: { p_lead: Json }
        Returns: Database["public"]["Tables"]["leads"]["Row"]
      }
      create_lead_from_integration: {
        Args: {
          p_integration_credential_id: string
          p_external_submission_id: string
          p_lead: Json
          p_attribution: Json
          p_raw_payload: Json
        }
        Returns: {
          lead_id: string
          submission_id: string
          is_new_lead: boolean
          duplicate_submission: boolean
        }[]
      }
      create_pipeline_stage: {
        Args: { p_pipeline_id: string; p_name: string }
        Returns: Database["public"]["Tables"]["pipeline_stages"]["Row"]
      }
      update_pipeline_stage: {
        Args: { p_stage_id: string; p_name: string | null; p_active: boolean | null }
        Returns: Database["public"]["Tables"]["pipeline_stages"]["Row"]
      }
      reorder_pipeline_stages: {
        Args: { p_pipeline_id: string; p_stage_ids: string[] }
        Returns: undefined
      }
      delete_pipeline_stage: {
        Args: { p_stage_id: string; p_reassign_to_stage_id: string | null }
        Returns: undefined
      }
      close_lead_won: {
        Args: {
          p_lead_id: string
          p_target_stage_id: string
          p_mrr: number | null
          p_tcv: number | null
          p_note: string | null
        }
        Returns: { lead_id: string; deal_id: string }[]
      }
      close_lead_lost: {
        Args: {
          p_lead_id: string
          p_target_stage_id: string
          p_lost_reason_id: string | null
          p_lost_note: string | null
        }
        Returns: Database["public"]["Tables"]["leads"]["Row"]
      }
      get_meta_integration_settings: {
        Args: never
        Returns: {
          pixel_id: string | null
          conversion_value_mode: Database["public"]["Enums"]["meta_conversion_value_mode"]
          active: boolean
          has_access_token: boolean
        }[]
      }
      get_meta_access_token: {
        Args: { p_organization_id: string; p_encryption_key: string }
        Returns: string | null
      }
      upsert_meta_integration: {
        Args: {
          p_pixel_id: string | null
          p_access_token: string | null
          p_encryption_key: string | null
          p_conversion_value_mode: Database["public"]["Enums"]["meta_conversion_value_mode"] | null
          p_active: boolean | null
        }
        Returns: {
          pixel_id: string | null
          conversion_value_mode: Database["public"]["Enums"]["meta_conversion_value_mode"]
          active: boolean
          has_access_token: boolean
        }[]
      }
    }
    Enums: {
      lead_temperature: "COLD" | "WARM" | "HOT"
      user_role: "ADMIN" | "SALES"
      pipeline_stage_type: "OPEN" | "WON" | "LOST"
      meta_conversion_value_mode: "MRR" | "TCV"
      conversion_event_status: "PENDING" | "SENT" | "FAILED"
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
      lead_temperature: ["COLD", "WARM", "HOT"],
      user_role: ["ADMIN", "SALES"],
      pipeline_stage_type: ["OPEN", "WON", "LOST"],
      meta_conversion_value_mode: ["MRR", "TCV"],
      conversion_event_status: ["PENDING", "SENT", "FAILED"],
    },
  },
} as const
