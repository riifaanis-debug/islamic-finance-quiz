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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      document_chunks: {
        Row: {
          bag_id: string
          block_index: number
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          page_number: number
          section_title: string | null
        }
        Insert: {
          bag_id: string
          block_index?: number
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          page_number?: number
          section_title?: string | null
        }
        Update: {
          bag_id?: string
          block_index?: number
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          page_number?: number
          section_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "training_bags"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          bag_id: string
          created_at: string
          extraction_method: string
          extraction_quality: string
          id: string
          layout_blocks: Json
          page_number: number
          page_text: string
          raw_text: string
          structured_text: string
        }
        Insert: {
          bag_id: string
          created_at?: string
          extraction_method?: string
          extraction_quality?: string
          id?: string
          layout_blocks?: Json
          page_number: number
          page_text?: string
          raw_text?: string
          structured_text?: string
        }
        Update: {
          bag_id?: string
          created_at?: string
          extraction_method?: string
          extraction_quality?: string
          id?: string
          layout_blocks?: Json
          page_number?: number
          page_text?: string
          raw_text?: string
          structured_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "training_bags"
            referencedColumns: ["id"]
          },
        ]
      }
      question_history: {
        Row: {
          answer_status: string | null
          answer_text: string | null
          confidence: number | null
          created_at: string
          detected_options: Json | null
          id: string
          image_url: string | null
          input_type: string | null
          processing_time: number | null
          question_mode: string | null
          question_text: string | null
          question_type: string | null
          selected_answer: string | null
          source_file: string | null
          source_page: number | null
        }
        Insert: {
          answer_status?: string | null
          answer_text?: string | null
          confidence?: number | null
          created_at?: string
          detected_options?: Json | null
          id?: string
          image_url?: string | null
          input_type?: string | null
          processing_time?: number | null
          question_mode?: string | null
          question_text?: string | null
          question_type?: string | null
          selected_answer?: string | null
          source_file?: string | null
          source_page?: number | null
        }
        Update: {
          answer_status?: string | null
          answer_text?: string | null
          confidence?: number | null
          created_at?: string
          detected_options?: Json | null
          id?: string
          image_url?: string | null
          input_type?: string | null
          processing_time?: number | null
          question_mode?: string | null
          question_text?: string | null
          question_type?: string | null
          selected_answer?: string | null
          source_file?: string | null
          source_page?: number | null
        }
        Relationships: []
      }
      training_bags: {
        Row: {
          created_at: string
          description: string | null
          error_message: string | null
          file_name: string
          file_path: string | null
          id: string
          processing_progress: number
          status: string
          title_ar: string
          title_en: string | null
          total_chunks: number
          total_pages: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          error_message?: string | null
          file_name: string
          file_path?: string | null
          id?: string
          processing_progress?: number
          status?: string
          title_ar: string
          title_en?: string | null
          total_chunks?: number
          total_pages?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          error_message?: string | null
          file_name?: string
          file_path?: string | null
          id?: string
          processing_progress?: number
          status?: string
          title_ar?: string
          title_en?: string | null
          total_chunks?: number
          total_pages?: number
          updated_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      keyword_chunks:
        | {
            Args: { match_count?: number; query_text: string }
            Returns: {
              bag_id: string
              bag_title: string
              content: string
              id: string
              page_number: number
              rank: number
              section_title: string
            }[]
          }
        | {
            Args: {
              bag_filter: string
              match_count: number
              query_text: string
            }
            Returns: {
              bag_id: string
              bag_title: string
              content: string
              id: string
              page_number: number
              rank: number
              section_title: string
            }[]
          }
      match_chunks: {
        Args: {
          bag_filter?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          bag_id: string
          bag_title: string
          content: string
          id: string
          page_number: number
          section_title: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
