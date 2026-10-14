export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      achievements: {
        Row: {
          awarded_on: string | null;
          created_at: string;
          description: string;
          id: string;
          image: Json | null;
          is_highlighted: boolean;
          is_published: boolean;
          issuer: string | null;
          kind: Database['public']['Enums']['achievement_kind'];
          link: string | null;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          awarded_on?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          image?: Json | null;
          is_highlighted?: boolean;
          is_published?: boolean;
          issuer?: string | null;
          kind?: Database['public']['Enums']['achievement_kind'];
          link?: string | null;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          awarded_on?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          image?: Json | null;
          is_highlighted?: boolean;
          is_published?: boolean;
          issuer?: string | null;
          kind?: Database['public']['Enums']['achievement_kind'];
          link?: string | null;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_owner: {
        Row: {
          singleton: boolean;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          singleton?: boolean;
          user_id: string;
        };
        Update: {
          singleton?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      custom_items: {
        Row: {
          created_at: string;
          data: NonNullable<Json>;
          id: string;
          is_published: boolean;
          section_id: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          is_published?: boolean;
          section_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          is_published?: boolean;
          section_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'custom_items_section_id_fkey';
            columns: ['section_id'];
            isOneToOne: false;
            referencedRelation: 'custom_sections';
            referencedColumns: ['id'];
          },
        ];
      };
      custom_sections: {
        Row: {
          created_at: string;
          fields: NonNullable<Json>;
          has_page: boolean;
          id: string;
          insert_after: Database['public']['Enums']['chapter_key'];
          intro: string;
          is_published: boolean;
          layout: Database['public']['Enums']['section_layout'];
          name: string;
          show_in_nav: boolean;
          show_on_home: boolean;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          fields: NonNullable<Json>;
          has_page?: boolean;
          id?: string;
          insert_after?: Database['public']['Enums']['chapter_key'];
          intro?: string;
          is_published?: boolean;
          layout?: Database['public']['Enums']['section_layout'];
          name: string;
          show_in_nav?: boolean;
          show_on_home?: boolean;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          fields?: NonNullable<Json>;
          has_page?: boolean;
          id?: string;
          insert_after?: Database['public']['Enums']['chapter_key'];
          intro?: string;
          is_published?: boolean;
          layout?: Database['public']['Enums']['section_layout'];
          name?: string;
          show_in_nav?: boolean;
          show_on_home?: boolean;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      experience: {
        Row: {
          company: string;
          created_at: string;
          description: string;
          employment_type: Database['public']['Enums']['employment_type'];
          end_date: string | null;
          highlights: string[];
          id: string;
          is_published: boolean;
          location: string;
          logo: Json | null;
          role: string;
          sort_order: number;
          start_date: string;
          tech: string[];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company: string;
          created_at?: string;
          description?: string;
          employment_type?: Database['public']['Enums']['employment_type'];
          end_date?: string | null;
          highlights?: string[];
          id?: string;
          is_published?: boolean;
          location?: string;
          logo?: Json | null;
          role: string;
          sort_order?: number;
          start_date: string;
          tech?: string[];
          updated_at?: string;
        };
        Update: {
          company?: string;
          created_at?: string;
          description?: string;
          employment_type?: Database['public']['Enums']['employment_type'];
          end_date?: string | null;
          highlights?: string[];
          id?: string;
          is_published?: boolean;
          location?: string;
          logo?: Json | null;
          role?: string;
          sort_order?: number;
          start_date?: string;
          tech?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      hero_media: {
        Row: {
          created_at: string;
          id: string;
          is_published: boolean;
          poster: NonNullable<Json>;
          sort_order: number;
          source_type: Database['public']['Enums']['hero_source'];
          theme: Database['public']['Enums']['theme_scope'];
          title: string;
          updated_at: string;
          video_mobile: string | null;
          video_mp4: string;
          video_webm: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_published?: boolean;
          poster: NonNullable<Json>;
          sort_order?: number;
          source_type: Database['public']['Enums']['hero_source'];
          theme?: Database['public']['Enums']['theme_scope'];
          title: string;
          updated_at?: string;
          video_mobile?: string | null;
          video_mp4: string;
          video_webm?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_published?: boolean;
          poster?: NonNullable<Json>;
          sort_order?: number;
          source_type?: Database['public']['Enums']['hero_source'];
          theme?: Database['public']['Enums']['theme_scope'];
          title?: string;
          updated_at?: string;
          video_mobile?: string | null;
          video_mp4?: string;
          video_webm?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          body: string;
          budget: string | null;
          created_at: string;
          email: string;
          id: string;
          kind: Database['public']['Enums']['message_kind'];
          name: string;
          status: Database['public']['Enums']['message_status'];
          subject: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          budget?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          kind?: Database['public']['Enums']['message_kind'];
          name: string;
          status?: Database['public']['Enums']['message_status'];
          subject?: string;
        };
        Update: {
          body?: string;
          budget?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          kind?: Database['public']['Enums']['message_kind'];
          name?: string;
          status?: Database['public']['Enums']['message_status'];
          subject?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          body: string;
          category: Database['public']['Enums']['project_category'];
          client: string | null;
          cover: Json | null;
          created_at: string;
          gallery: NonNullable<Json>;
          globe: Json | null;
          id: string;
          is_featured: boolean;
          is_published: boolean;
          links: NonNullable<Json>;
          role: string;
          slug: string;
          sort_order: number;
          summary: string;
          tech: string[];
          title: string;
          updated_at: string;
          year: number | null;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          category?: Database['public']['Enums']['project_category'];
          client?: string | null;
          cover?: Json | null;
          created_at?: string;
          gallery?: NonNullable<Json>;
          globe?: Json | null;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          links?: NonNullable<Json>;
          role?: string;
          slug: string;
          sort_order?: number;
          summary: string;
          tech?: string[];
          title: string;
          updated_at?: string;
          year?: number | null;
        };
        Update: {
          body?: string;
          category?: Database['public']['Enums']['project_category'];
          client?: string | null;
          cover?: Json | null;
          created_at?: string;
          gallery?: NonNullable<Json>;
          globe?: Json | null;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          links?: NonNullable<Json>;
          role?: string;
          slug?: string;
          sort_order?: number;
          summary?: string;
          tech?: string[];
          title?: string;
          updated_at?: string;
          year?: number | null;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          available_for_work: boolean;
          bio_long: string;
          bio_short: string;
          display_name: string;
          hero_playback: Database['public']['Enums']['hero_playback'];
          id: number;
          location: string;
          portrait: Json | null;
          public_email: string | null;
          resume_path: string | null;
          seo: NonNullable<Json>;
          socials: NonNullable<Json>;
          tagline: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          available_for_work?: boolean;
          bio_long?: string;
          bio_short?: string;
          display_name?: string;
          hero_playback?: Database['public']['Enums']['hero_playback'];
          id?: number;
          location?: string;
          portrait?: Json | null;
          public_email?: string | null;
          resume_path?: string | null;
          seo?: NonNullable<Json>;
          socials?: NonNullable<Json>;
          tagline?: string;
          updated_at?: string;
        };
        Update: {
          available_for_work?: boolean;
          bio_long?: string;
          bio_short?: string;
          display_name?: string;
          hero_playback?: Database['public']['Enums']['hero_playback'];
          id?: number;
          location?: string;
          portrait?: Json | null;
          public_email?: string | null;
          resume_path?: string | null;
          seo?: NonNullable<Json>;
          socials?: NonNullable<Json>;
          tagline?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          category: string;
          created_at: string;
          icon: string | null;
          id: string;
          is_featured: boolean;
          is_published: boolean;
          level: number | null;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          level?: number | null;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          level?: number | null;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      testimonials: {
        Row: {
          author_company: string;
          author_name: string;
          author_role: string;
          avatar: Json | null;
          created_at: string;
          id: string;
          is_published: boolean;
          project_id: string | null;
          quote: string;
          rating: number | null;
          sort_order: number;
          source_url: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_company?: string;
          author_name: string;
          author_role?: string;
          avatar?: Json | null;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          project_id?: string | null;
          quote: string;
          rating?: number | null;
          sort_order?: number;
          source_url?: string | null;
          updated_at?: string;
        };
        Update: {
          author_company?: string;
          author_name?: string;
          author_role?: string;
          avatar?: Json | null;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          project_id?: string | null;
          quote?: string;
          rating?: number | null;
          sort_order?: number;
          source_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'testimonials_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_email: { Args: { v: string }; Returns: boolean };
      is_globe_position: { Args: { j: Json }; Returns: boolean };
      is_https_url: { Args: { v: string }; Returns: boolean };
      is_image_ref: { Args: { j: Json }; Returns: boolean };
      is_image_ref_array: { Args: { j: Json; max_items: number }; Returns: boolean };
      is_owner: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_seo: { Args: { j: Json }; Returns: boolean };
      is_slug: { Args: { v: string }; Returns: boolean };
      is_storage_path: { Args: { v: string }; Returns: boolean };
      is_text_list: { Args: { arr: string[]; max_items: number; max_len: number }; Returns: boolean };
      is_url_map: { Args: { allowed: string[]; j: Json }; Returns: boolean };
      is_valid_field_defs: { Args: { j: Json }; Returns: boolean };
      reorder: { Args: { p_ids: string[]; p_table: string }; Returns: undefined };
    };
    Enums: {
      achievement_kind: 'award' | 'certification' | 'title' | 'recognition' | 'publication' | 'other';
      chapter_key: 'hero' | 'about' | 'projects' | 'credits' | 'timeline' | 'reviews' | 'contact';
      employment_type: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship';
      hero_playback: 'single' | 'sequence' | 'random';
      hero_source: 'upload' | 'url';
      message_kind: 'hire' | 'freelance' | 'collab' | 'general';
      message_status: 'new' | 'read' | 'replied' | 'archived';
      project_category: 'work' | 'freelance' | 'personal';
      section_layout: 'grid' | 'list' | 'timeline' | 'carousel' | 'gallery';
      theme_scope: 'dark' | 'light' | 'both';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      achievement_kind: ['award', 'certification', 'title', 'recognition', 'publication', 'other'],
      chapter_key: ['hero', 'about', 'projects', 'credits', 'timeline', 'reviews', 'contact'],
      employment_type: ['full_time', 'part_time', 'contract', 'freelance', 'internship'],
      hero_playback: ['single', 'sequence', 'random'],
      hero_source: ['upload', 'url'],
      message_kind: ['hire', 'freelance', 'collab', 'general'],
      message_status: ['new', 'read', 'replied', 'archived'],
      project_category: ['work', 'freelance', 'personal'],
      section_layout: ['grid', 'list', 'timeline', 'carousel', 'gallery'],
      theme_scope: ['dark', 'light', 'both'],
    },
  },
} as const;
