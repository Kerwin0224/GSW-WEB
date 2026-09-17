export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** 角色的唯一真源：类型与运行时校验（zod 枚举）都从这里派生，避免第二处手抄枚举漏角色。 */
export const APP_ROLES = ['org_admin', 'admin', 'teacher', 'student'] as const;
export type AppRole = (typeof APP_ROLES)[number];
export type AvatarKey = 'ink' | 'pine' | 'cinnabar' | 'moon' | 'bamboo' | 'plum';
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
        Row: { id: string; login_id: string | null; display_name: string; role: AppRole; status: 'active' | 'disabled'; avatar_key: AvatarKey; session_version: number; must_change_password: boolean; organization_id: string | null; school_id: string | null; created_at: string; updated_at: string };
        Insert: { id: string; login_id?: string | null; display_name: string; role: AppRole; status?: 'active' | 'disabled'; avatar_key?: AvatarKey; must_change_password?: boolean; organization_id?: string | null; school_id?: string | null };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      organizations: {
        Row: { id: string; name: string; status: 'active' | 'disabled'; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; status?: 'active' | 'disabled' };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };
      schools: {
        Row: { id: string; org_id: string; name: string; status: 'active' | 'disabled'; created_at: string; updated_at: string };
        Insert: { id?: string; org_id: string; name: string; status?: 'active' | 'disabled' };
        Update: Partial<Database['public']['Tables']['schools']['Insert']>;
      };
      classes: {
        Row: { id: string; name: string; grade: string | null; status: 'active' | 'archived'; school_id: string | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; grade?: string | null; status?: 'active' | 'archived'; school_id?: string | null; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['classes']['Insert']>;
      };
      class_memberships: {
        Row: { id: string; class_id: string; profile_id: string; role: 'teacher' | 'student'; created_at: string };
        Insert: { id?: string; class_id: string; profile_id: string; role: 'teacher' | 'student' };
        Update: Partial<Database['public']['Tables']['class_memberships']['Insert']>;
      };
      /**
       * 空间：老师自建、拉学生、带主题的学习容器。成员由 space_classes 派生（见该表）。
       * school_id 不可变、owner 必须是同校教师，两条都由触发器钉住，不靠应用层自觉。
       */
      spaces: {
        Row: { id: string; school_id: string; owner_id: string; name: string; theme: string; status: 'active' | 'archived'; created_at: string; updated_at: string };
        Insert: { id?: string; school_id: string; owner_id: string; name: string; theme?: string; status?: 'active' | 'archived' };
        Update: Partial<Database['public']['Tables']['spaces']['Insert']>;
      };
      /** 成员关系就是这条边：一行 = 该班全部学生都在这个空间里。 */
      space_classes: {
        Row: { space_id: string; class_id: string; created_by: string | null; created_at: string };
        Insert: { space_id: string; class_id: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['space_classes']['Insert']>;
      };
      provider_configs: {
        Row: { id: string; school_id: string | null; name: string; provider_type: string; base_url: string | null; secret_ref: string | null; secret_last_four: string | null; secret_created_at: string | null; secret_last_used_at: string | null; secret_rotated_at: string | null; api_models: Json; last_health_check_at: string | null; last_health_latency_ms: number | null; is_enabled: boolean; health_status: string; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; school_id?: string | null; name: string; provider_type: string; base_url?: string | null; secret_ref?: string | null; secret_last_four?: string | null; secret_created_at?: string | null; secret_last_used_at?: string | null; secret_rotated_at?: string | null; api_models?: Json; last_health_check_at?: string | null; last_health_latency_ms?: number | null; is_enabled?: boolean; health_status?: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['provider_configs']['Insert']>;
      };
      provider_capabilities: {
        Row: { id: string; school_id: string | null; provider_id: string; capability: ProviderCapability; model_id: string; is_enabled: boolean; metadata: Json };
        Insert: { id?: string; school_id?: string | null; provider_id: string; capability: ProviderCapability; model_id: string; is_enabled?: boolean; metadata?: Json };
        Update: Partial<Database['public']['Tables']['provider_capabilities']['Insert']>;
      };
      model_tier_bindings: {
        Row: { id: string; school_id: string | null; tier: ModelTier; provider_id: string; model_id: string; is_enabled: boolean; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; school_id?: string | null; tier: ModelTier; provider_id: string; model_id: string; is_enabled?: boolean; metadata?: Json };
        Update: Partial<Database['public']['Tables']['model_tier_bindings']['Insert']>;
      };
      scenario_tier_bindings: {
        Row: { id: string; scenario: ProviderCapability; tier: ModelTier; is_enabled: boolean; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; scenario: ProviderCapability; tier: ModelTier; is_enabled?: boolean; metadata?: Json };
        Update: Partial<Database['public']['Tables']['scenario_tier_bindings']['Insert']>;
      };
      mcp_servers: {
        Row: { id: string; school_id: string | null; name: string; description: string | null; connection_ref: string | null; secret_ref: string | null; secret_last_four: string | null; health_status: string; enabled_tools: Json; allowed_roles: AppRole[]; metadata: Json; is_enabled: boolean; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; school_id?: string | null; name: string; description?: string | null; connection_ref?: string | null; secret_ref?: string | null; secret_last_four?: string | null; health_status?: string; enabled_tools?: Json; allowed_roles?: AppRole[]; metadata?: Json; is_enabled?: boolean; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['mcp_servers']['Insert']>;
      };
      prompt_presets: {
        Row: { id: string; organization_id: string | null; school_id: string | null; title: string; scenario: string; system_instruction: string; user_template: string | null; variables: Json; target_role: AppRole; status: PromptPresetStatus; version: number; created_by: string | null; class_id: string | null; purpose: 'chat' | 'project_classification'; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id?: string | null; school_id?: string | null; title: string; scenario: string; system_instruction: string; user_template?: string | null; variables?: Json; target_role?: AppRole; status?: PromptPresetStatus; version?: number; created_by?: string | null; class_id?: string | null; purpose?: 'chat' | 'project_classification' };
        Update: Partial<Database['public']['Tables']['prompt_presets']['Insert']>;
      };
      projects: {
        Row: { id: string; owner_id: string; class_id: string | null; name: string; subtitle: string | null; classification_state: 'pending' | 'classified' | 'failed' | 'manual'; highest_bloom_level: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; name: string; subtitle?: string | null; classification_state?: 'pending' | 'classified' | 'failed' | 'manual'; highest_bloom_level?: number | null };
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
      conversations: {
        Row: { id: string; owner_id: string; class_id: string | null; project_id: string | null; source: InteractionSource; prompt_preset_id: string | null; title: string | null; deleted_at: string | null; finalized_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; project_id?: string | null; source: InteractionSource; prompt_preset_id?: string | null; title?: string | null; deleted_at?: string | null; finalized_at?: string | null };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
      };
      conversation_messages: {
        Row: { id: string; conversation_id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; parts: Json | null; bloom_level: number | null; bloom_state: 'pending' | 'classified' | 'failed' | 'unclassified'; model_id: string | null; created_at: string };
        Insert: { id?: string; conversation_id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; parts?: Json | null; bloom_level?: number | null; bloom_state?: 'pending' | 'classified' | 'failed' | 'unclassified'; model_id?: string | null };
        Update: Partial<Database['public']['Tables']['conversation_messages']['Insert']>;
      };
      documents: {
        Row: { id: string; owner_id: string; class_id: string | null; project_id: string | null; conversation_id: string | null; title: string; content: string | null; source_uri: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; project_id?: string | null; conversation_id?: string | null; title: string; content?: string | null; source_uri?: string | null; metadata?: Json };
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
        Row: { id: string; export_type: AuditKind; status: 'queued' | 'ready' | 'failed'; record_count: number; jsonl: string; school_id: string | null; created_by: string | null; created_at: string };
        Insert: { id?: string; export_type: AuditKind; status?: 'queued' | 'ready' | 'failed'; record_count?: number; jsonl: string; school_id?: string | null; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['export_batches']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** 建空间 + 写主题 + 拉一个班，一次调用；同名活跃空间幂等复用。 */
      create_space: {
        Args: { p_name: string; p_theme: string; p_class_id?: string | null };
        Returns: string;
      };
      /** 再拉一个班。返回新增边数：0 表示本来就在。 */
      pull_class_into_space: {
        Args: { p_space_id: string; p_class_id: string };
        Returns: number;
      };
      change_own_password: {
        Args: { p_current_password: string; p_new_password: string };
        Returns: { id: string; login_id: string; role: AppRole; display_name: string; avatar_key: AvatarKey; session_version: number }[];
      };
      update_own_avatar: { Args: { p_avatar_key: string }; Returns: AvatarKey };
      write_app_log_event: {
        Args: { p_event_id: string; p_level: 'debug' | 'info' | 'warn' | 'error'; p_area: string; p_event: string; p_route: string | null; p_method: string | null; p_status: number | null; p_request_id: string | null; p_message: string | null; p_digest: string | null; p_context: Json | null; p_server_signature: string };
        Returns: undefined;
      };
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
    };
    Enums: { app_role: AppRole; model_tier: ModelTier; provider_capability: ProviderCapability; prompt_preset_status: PromptPresetStatus; interaction_source: InteractionSource; audit_kind: AuditKind; audit_status: AuditStatus; export_status: ExportStatus };
    CompositeTypes: Record<string, never>;
  };
}
