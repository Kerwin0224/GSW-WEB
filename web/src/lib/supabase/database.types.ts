export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = 'admin' | 'teacher' | 'student';
export type ModelTier = 'flash' | 'advanced';
export type ProviderCapability =
  | 'student_chat'
  | 'teacher_chat'
  | 'bloom_classification'
  | 'project_classification'
  | 'practice_generation'
  | 'practice_evaluation'
  | 'audit_assist'
  | 'embedding';
export type PromptPresetStatus = 'draft' | 'published' | 'disabled';
export type InteractionSource = 'student_chat' | 'teacher_chat' | 'practice';
export type AuditKind = 'sft' | 'dpo' | 'metadata';
/**
 * audit_records.status 是否已发往导出批次的二元标志。
 * - approved：教师已审批的样本，等待管理员导出。
 * - exported：管理员已导出，保留以便重复导出和审计。
 *
 * 没有 pending/rejected 中间态：会话级最终提交本身就是审批动作（CONTEXT.md
 * "确认提交整个会话"），样本要么不存在，要么 approved/exported。
 */
export type AuditStatus = 'approved' | 'exported';
export type ExportStatus = 'queued' | 'ready' | 'failed';
export type Vector = number[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; login_id: string | null; display_name: string; role: AppRole; status: 'active' | 'disabled'; created_at: string; updated_at: string };
        Insert: { id: string; login_id?: string | null; display_name: string; role: AppRole; status?: 'active' | 'disabled' };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      classes: {
        Row: { id: string; name: string; grade: string | null; status: 'active' | 'archived'; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; grade?: string | null; status?: 'active' | 'archived'; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['classes']['Insert']>;
      };
      class_memberships: {
        Row: { id: string; class_id: string; profile_id: string; role: 'teacher' | 'student'; created_at: string };
        Insert: { id?: string; class_id: string; profile_id: string; role: 'teacher' | 'student' };
        Update: Partial<Database['public']['Tables']['class_memberships']['Insert']>;
      };
      provider_configs: {
        Row: { id: string; name: string; provider_type: string; base_url: string | null; secret_ref: string | null; secret_last_four: string | null; secret_created_at: string | null; secret_last_used_at: string | null; secret_rotated_at: string | null; api_models: Json; last_health_check_at: string | null; last_health_latency_ms: number | null; is_enabled: boolean; health_status: string; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; provider_type: string; base_url?: string | null; secret_ref?: string | null; secret_last_four?: string | null; secret_created_at?: string | null; secret_last_used_at?: string | null; secret_rotated_at?: string | null; api_models?: Json; last_health_check_at?: string | null; last_health_latency_ms?: number | null; is_enabled?: boolean; health_status?: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['provider_configs']['Insert']>;
      };
      provider_capabilities: {
        Row: { id: string; provider_id: string; capability: ProviderCapability; model_id: string; is_enabled: boolean; metadata: Json };
        Insert: { id?: string; provider_id: string; capability: ProviderCapability; model_id: string; is_enabled?: boolean; metadata?: Json };
        Update: Partial<Database['public']['Tables']['provider_capabilities']['Insert']>;
      };
      model_tier_bindings: {
        Row: { id: string; tier: ModelTier; provider_id: string; model_id: string; is_enabled: boolean; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; tier: ModelTier; provider_id: string; model_id: string; is_enabled?: boolean; metadata?: Json };
        Update: Partial<Database['public']['Tables']['model_tier_bindings']['Insert']>;
      };
      scenario_tier_bindings: {
        Row: { id: string; scenario: ProviderCapability; tier: ModelTier; is_enabled: boolean; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; scenario: ProviderCapability; tier: ModelTier; is_enabled?: boolean; metadata?: Json };
        Update: Partial<Database['public']['Tables']['scenario_tier_bindings']['Insert']>;
      };
      mcp_servers: {
        Row: { id: string; name: string; description: string | null; connection_ref: string | null; secret_ref: string | null; secret_last_four: string | null; health_status: string; enabled_tools: Json; allowed_roles: AppRole[]; metadata: Json; is_enabled: boolean; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; description?: string | null; connection_ref?: string | null; secret_ref?: string | null; secret_last_four?: string | null; health_status?: string; enabled_tools?: Json; allowed_roles?: AppRole[]; metadata?: Json; is_enabled?: boolean; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['mcp_servers']['Insert']>;
      };
      prompt_presets: {
        Row: { id: string; title: string; scenario: string; system_instruction: string; user_template: string | null; variables: Json; target_role: AppRole; status: PromptPresetStatus; version: number; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; title: string; scenario: string; system_instruction: string; user_template?: string | null; variables?: Json; target_role?: AppRole; status?: PromptPresetStatus; version?: number; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['prompt_presets']['Insert']>;
      };
      text_projects: {
        Row: { id: string; owner_id: string; class_id: string | null; title: string; author: string | null; text_type: string; classification_state: 'pending' | 'classified' | 'failed' | 'manual'; highest_bloom_level: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; title: string; author?: string | null; text_type?: string; classification_state?: 'pending' | 'classified' | 'failed' | 'manual'; highest_bloom_level?: number | null };
        Update: Partial<Database['public']['Tables']['text_projects']['Insert']>;
      };
      conversations: {
        Row: { id: string; owner_id: string; class_id: string | null; project_id: string | null; source: InteractionSource; prompt_preset_id: string | null; title: string | null; deleted_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; project_id?: string | null; source: InteractionSource; prompt_preset_id?: string | null; title?: string | null; deleted_at?: string | null };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
      };
      conversation_messages: {
        Row: { id: string; conversation_id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; parts: Json | null; bloom_level: number | null; bloom_state: 'pending' | 'classified' | 'failed' | 'unclassified'; model_id: string | null; created_at: string };
        Insert: { id?: string; conversation_id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; parts?: Json | null; bloom_level?: number | null; bloom_state?: 'pending' | 'classified' | 'failed' | 'unclassified'; model_id?: string | null };
        Update: Partial<Database['public']['Tables']['conversation_messages']['Insert']>;
      };
      documents: {
        Row: { id: string; owner_id: string; class_id: string | null; project_id: string | null; conversation_id: string | null; title: string; author: string | null; dynasty: string | null; content: string | null; source_uri: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; project_id?: string | null; conversation_id?: string | null; title: string; author?: string | null; dynasty?: string | null; content?: string | null; source_uri?: string | null; metadata?: Json };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
      };
      document_chunks: {
        Row: { id: string; document_id: string; owner_id: string; class_id: string | null; project_id: string | null; conversation_id: string | null; chunk_index: number; content: string; token_count: number | null; metadata: Json; embedding: Vector; created_at: string };
        Insert: { id?: string; document_id: string; owner_id: string; class_id?: string | null; project_id?: string | null; conversation_id?: string | null; chunk_index: number; content: string; token_count?: number | null; metadata?: Json; embedding: Vector };
        Update: Partial<Database['public']['Tables']['document_chunks']['Insert']>;
      };
      practice_records: {
        Row: { id: string; student_id: string; project_id: string; target_bloom_level: number; prompt: string | null; answer: string | null; feedback: string | null; achieved: boolean | null; evaluation_state: 'pending' | 'evaluated' | 'failed' | 'blocked'; created_at: string };
        Insert: { id?: string; student_id: string; project_id: string; target_bloom_level: number; prompt?: string | null; answer?: string | null; feedback?: string | null; achieved?: boolean | null; evaluation_state?: 'pending' | 'evaluated' | 'failed' | 'blocked' };
        Update: Partial<Database['public']['Tables']['practice_records']['Insert']>;
      };
      app_log_events: {
        Row: { id: string; created_at: string; level: 'debug' | 'info' | 'warn' | 'error'; area: string; event: string; route: string | null; method: string | null; status: number | null; request_id: string | null; message: string | null; digest: string | null; context: Json | null };
        Insert: { id?: string; created_at?: string; level: 'debug' | 'info' | 'warn' | 'error'; area: string; event: string; route?: string | null; method?: string | null; status?: number | null; request_id?: string | null; message?: string | null; digest?: string | null; context?: Json | null };
        Update: Partial<Database['public']['Tables']['app_log_events']['Insert']>;
      };
      audit_records: {
        Row: { id: string; source_message_id: string; source_conversation_id: string; auditor_id: string | null; class_id: string; kind: AuditKind; status: AuditStatus; quality: string | null; prompt: string; original_answer: string | null; corrected_answer: string | null; chosen_answer: string | null; rejected_answer: string | null; rationale: string | null; metadata: Json; exported_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; source_message_id: string; source_conversation_id: string; auditor_id?: string | null; class_id: string; kind: AuditKind; status?: AuditStatus; quality?: string | null; prompt: string; original_answer?: string | null; corrected_answer?: string | null; chosen_answer?: string | null; rejected_answer?: string | null; rationale?: string | null; metadata?: Json; exported_at?: string | null };
        Update: Partial<Database['public']['Tables']['audit_records']['Insert']>;
      };
      export_batches: {
        Row: { id: string; export_type: AuditKind; status: 'queued' | 'ready' | 'failed'; record_count: number; jsonl: string; created_by: string | null; created_at: string };
        Insert: { id?: string; export_type: AuditKind; status?: 'queued' | 'ready' | 'failed'; record_count?: number; jsonl: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['export_batches']['Insert']>;
      };
      data_quality_events: {
        Row: { id: string; event_type: string; table_name: string; record_count: number; reason: string; payload: Json; created_at: string };
        Insert: { id?: string; event_type: string; table_name: string; record_count?: number; reason: string; payload?: Json };
        Update: Partial<Database['public']['Tables']['data_quality_events']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      authenticate_school_account: {
        Args: { p_login_id: string; p_password: string };
        Returns: { id: string; login_id: string; role: AppRole; display_name: string }[];
      };
      get_profile: { Args: { p_user_id: string }; Returns: Database['public']['Tables']['profiles']['Row'][] };
      match_document_chunks: {
        Args: { query_embedding: Vector; match_count?: number; match_threshold?: number; project_id?: string | null };
        Returns: { id: string; document_id: string; owner_id: string; class_id: string | null; project_id: string | null; chunk_index: number; content: string; metadata: Json; document_title: string; source_uri: string | null; similarity: number }[];
      };
      match_conversation_document_chunks: {
        Args: { query_embedding: Vector; conversation_id: string; match_count?: number; match_threshold?: number };
        Returns: { id: string; document_id: string; owner_id: string; class_id: string | null; project_id: string | null; conversation_id: string | null; chunk_index: number; content: string; metadata: Json; document_title: string; source_uri: string | null; similarity: number }[];
      };
      get_model_tier_provider: {
        Args: { p_tier: string };
        Returns: { tier: string; model_id: string; binding_enabled: boolean; provider_id: string; provider_name: string; provider_type: string; base_url: string | null; secret_ref: string | null; health_status: string; provider_enabled: boolean }[];
      };
      get_provider_capability_provider: {
        Args: { p_capability: ProviderCapability };
        Returns: { capability: ProviderCapability; model_id: string; provider_name: string; provider_type: string; base_url: string | null; secret_ref: string | null; health_status: string }[];
      };
      is_student_conversation_finalized: { Args: { p_conversation_id: string }; Returns: boolean };
      save_model_tier_binding_and_sync: { Args: { p_tier: string; p_provider_id: string; p_model_id: string }; Returns: undefined };
      save_scenario_tier_bindings_and_sync: { Args: { p_bindings: Json }; Returns: undefined };
      refresh_project_highest_bloom_level: { Args: { p_project_id: string }; Returns: undefined };
    };
    Enums: { app_role: AppRole; model_tier: ModelTier; provider_capability: ProviderCapability; prompt_preset_status: PromptPresetStatus; interaction_source: InteractionSource; audit_kind: AuditKind; audit_status: AuditStatus; export_status: ExportStatus };
    CompositeTypes: Record<string, never>;
  };
}
