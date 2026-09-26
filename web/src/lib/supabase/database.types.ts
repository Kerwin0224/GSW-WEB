export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** 角色的唯一真源：类型与运行时校验（zod 枚举）都从这里派生，避免第二处手抄枚举漏角色。 */
export const APP_ROLES = ['org_admin', 'admin', 'teacher', 'student'] as const;
export type AppRole = (typeof APP_ROLES)[number];
export type AvatarKey = 'ink' | 'pine' | 'cinnabar' | 'moon' | 'bamboo' | 'plum';
export type SpaceColorKey = 'ink' | 'pine' | 'cinnabar' | 'moon' | 'bamboo' | 'plum';
export type SpaceKind = 'term' | 'topic';
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
/** 学校类型：学校只是租户组织的一种，教培机构/工作室/教研联盟各有落点。 */
export type SchoolKind = 'school' | 'campus' | 'training_org' | 'studio' | 'alliance' | 'other';
/** 预设用途。挑战出题/评阅与学生会话此前 100% 硬编码在代码里，租户改不了。 */
export type PresetPurpose =
  | 'chat' | 'project_classification' | 'student_chat'
  | 'challenge_generation' | 'challenge_evaluation' | 'pre_review';
export type ReviewState = 'pending' | 'in_review' | 'changes_requested' | 'finalized';
export type AssignmentKind = 'practice' | 'question' | 'reading' | 'project_work';
export type SpaceMemberRole = 'student' | 'co_teacher' | 'observer';
export type ScopeType = 'class' | 'space' | 'school' | 'organization';
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
        Row: { id: string; login_id: string | null; display_name: string; role: AppRole; status: 'active' | 'disabled'; avatar_key: AvatarKey; session_version: number; must_change_password: boolean; subject: string | null; organization_id: string | null; school_id: string | null; created_at: string; updated_at: string };
        Insert: { id: string; login_id?: string | null; display_name: string; role: AppRole; status?: 'active' | 'disabled'; avatar_key?: AvatarKey; must_change_password?: boolean; subject?: string | null; organization_id?: string | null; school_id?: string | null };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      organizations: {
        Row: { id: string; name: string; status: 'active' | 'disabled'; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; status?: 'active' | 'disabled' };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };
      schools: {
        Row: { id: string; org_id: string; name: string; status: 'active' | 'disabled'; kind: SchoolKind; education_stages: string[]; login_id_pattern: string; created_at: string; updated_at: string };
        Insert: { id?: string; org_id: string; name: string; status?: 'active' | 'disabled'; kind?: SchoolKind; education_stages?: string[]; login_id_pattern?: string };
        Update: Partial<Database['public']['Tables']['schools']['Insert']>;
      };
      classes: {
        Row: { id: string; name: string; grade: string | null; stage: string | null; status: 'active' | 'archived'; school_id: string | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; grade?: string | null; stage?: string | null; status?: 'active' | 'archived'; school_id?: string | null; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['classes']['Insert']>;
      };
      class_memberships: {
        Row: { id: string; class_id: string; profile_id: string; role: 'teacher' | 'student'; is_primary: boolean; created_at: string };
        Insert: { id?: string; class_id: string; profile_id: string; role: 'teacher' | 'student'; is_primary?: boolean };
        Update: Partial<Database['public']['Tables']['class_memberships']['Insert']>;
      };
      /**
       * 空间：老师自建、拉学生、带主题的学习容器。成员由 space_classes 派生（见该表）。
       * school_id 不可变、owner 必须是同校教师，两条都由触发器钉住，不靠应用层自觉。
       */
      spaces: {
        Row: { id: string; school_id: string | null; organization_id: string | null; owner_id: string; name: string; theme: string; subject: string | null; subject_id: string | null; color_key: SpaceColorKey; space_kind: SpaceKind; starter_prompts: Json | null; status: 'active' | 'archived'; created_at: string; updated_at: string };
        Insert: { id?: string; school_id?: string | null; organization_id?: string | null; owner_id: string; name: string; theme?: string; subject?: string | null; subject_id?: string | null; color_key?: SpaceColorKey; space_kind?: SpaceKind; starter_prompts?: Json | null; status?: 'active' | 'archived' };
        Update: Partial<Database['public']['Tables']['spaces']['Insert']>;
      };
      /** 直接加入空间的学生；班级成员仍由 space_classes 派生。 */
      space_members: {
        Row: { space_id: string; student_id: string; member_role: SpaceMemberRole; created_by: string | null; created_at: string };
        Insert: { space_id: string; student_id: string; member_role?: SpaceMemberRole; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['space_members']['Insert']>;
      };
      /** 空间协作者：与成员表分开——「有协作权」和「带学生」是两件事。 */
      space_collaborators: {
        Row: { space_id: string; profile_id: string; role: 'co_teacher' | 'owner'; created_by: string | null; created_at: string };
        Insert: { space_id: string; profile_id: string; role?: 'co_teacher' | 'owner'; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['space_collaborators']['Insert']>;
      };
      /** 作用域级能力位：班主任 / 教研组长 / 助教 / 导师。 */
      role_grants: {
        Row: { id: string; profile_id: string; capability: string; scope_type: ScopeType; scope_id: string | null; granted_by: string | null; created_at: string };
        Insert: { profile_id: string; capability: string; scope_type: ScopeType; scope_id?: string | null; granted_by?: string | null };
        Update: Partial<Database['public']['Tables']['role_grants']['Insert']>;
      };
      /** 科目词表：自由文本会让「物理」与「Physics」算成两个空间。 */
      subjects: {
        Row: { id: string; school_id: string; code: string; name: string; aliases: string[]; sort_order: number; enabled: boolean; created_at: string; updated_at: string };
        Insert: { school_id: string; code: string; name: string; aliases?: string[]; sort_order?: number; enabled?: boolean };
        Update: Partial<Database['public']['Tables']['subjects']['Insert']>;
      };
      /** 班级派生成员关系：一行代表该班全部学生。 */
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
        Row: { id: string; scenario: ProviderCapability; scenario_key: string | null; tier: ModelTier; is_enabled: boolean; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; scenario: ProviderCapability; scenario_key?: string | null; tier: ModelTier; is_enabled?: boolean; metadata?: Json };
        Update: Partial<Database['public']['Tables']['scenario_tier_bindings']['Insert']>;
      };
      mcp_servers: {
        Row: { id: string; school_id: string | null; name: string; description: string | null; connection_ref: string | null; secret_ref: string | null; secret_last_four: string | null; health_status: string; enabled_tools: Json; allowed_roles: AppRole[]; metadata: Json; is_enabled: boolean; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; school_id?: string | null; name: string; description?: string | null; connection_ref?: string | null; secret_ref?: string | null; secret_last_four?: string | null; health_status?: string; enabled_tools?: Json; allowed_roles?: AppRole[]; metadata?: Json; is_enabled?: boolean; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['mcp_servers']['Insert']>;
      };
      prompt_presets: {
        Row: { id: string; organization_id: string | null; school_id: string | null; title: string; scenario: string; system_instruction: string; user_template: string | null; variables: Json; target_role: AppRole; status: PromptPresetStatus; version: number; created_by: string | null; class_id: string | null; purpose: PresetPurpose; space_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id?: string | null; school_id?: string | null; title: string; scenario: string; system_instruction: string; user_template?: string | null; variables?: Json; target_role?: AppRole; status?: PromptPresetStatus; version?: number; created_by?: string | null; class_id?: string | null; purpose?: PresetPurpose; space_id?: string | null };
        Update: Partial<Database['public']['Tables']['prompt_presets']['Insert']>;
      };
      projects: {
        Row: { id: string; owner_id: string; class_id: string | null; space_id: string | null; school_id: string | null; name: string; subtitle: string | null; classification_state: 'pending' | 'classified' | 'failed' | 'manual'; highest_bloom_level: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; space_id?: string | null; school_id?: string | null; name: string; subtitle?: string | null; classification_state?: 'pending' | 'classified' | 'failed' | 'manual'; highest_bloom_level?: number | null };
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
      conversations: {
        Row: { id: string; owner_id: string; class_id: string | null; project_id: string | null; space_id: string | null; school_id: string | null; source: InteractionSource; prompt_preset_id: string | null; title: string | null; deleted_at: string | null; finalized_at: string | null; review_state: ReviewState; locked_at: string | null; teacher_comment: string | null; finalized_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; project_id?: string | null; space_id?: string | null; school_id?: string | null; source: InteractionSource; prompt_preset_id?: string | null; title?: string | null; finalized_at?: string | null; review_state?: ReviewState; locked_at?: string | null; teacher_comment?: string | null; finalized_by?: string | null };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
      };
      conversation_messages: {
        Row: { id: string; conversation_id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; parts: Json | null; bloom_level: number | null; bloom_state: 'pending' | 'classified' | 'failed' | 'unclassified'; model_id: string | null; created_at: string };
        Insert: { id?: string; conversation_id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; parts?: Json | null; bloom_level?: number | null; bloom_state?: 'pending' | 'classified' | 'failed' | 'unclassified'; model_id?: string | null };
        Update: Partial<Database['public']['Tables']['conversation_messages']['Insert']>;
      };
      documents: {
        Row: { id: string; owner_id: string; class_id: string | null; project_id: string | null; conversation_id: string | null; space_id: string | null; title: string; content: string | null; source_uri: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; class_id?: string | null; project_id?: string | null; conversation_id?: string | null; space_id?: string | null; title: string; content?: string | null; source_uri?: string | null; metadata?: Json };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
      };
      document_chunks: {
        Row: { id: string; document_id: string; owner_id: string; class_id: string | null; project_id: string | null; conversation_id: string | null; chunk_index: number; content: string; token_count: number | null; metadata: Json; embedding: Vector; created_at: string };
        Insert: { id?: string; document_id: string; owner_id: string; class_id?: string | null; project_id?: string | null; conversation_id?: string | null; chunk_index: number; content: string; token_count?: number | null; metadata?: Json; embedding: Vector };
        Update: Partial<Database['public']['Tables']['document_chunks']['Insert']>;
      };
      practice_records: {
        Row: { id: string; student_id: string; project_id: string; target_bloom_level: number; prompt: string | null; answer: string | null; feedback: string | null; achieved: boolean | null; evaluation_state: 'pending' | 'evaluated' | 'failed' | 'blocked'; school_id: string | null; class_id: string | null; space_id: string | null; submission_parts: Json; rubric_notes: Json; assigned_by: string | null; source: 'self' | 'assigned'; created_at: string };
        Insert: { id?: string; student_id: string; project_id: string; target_bloom_level: number; prompt?: string | null; answer?: string | null; feedback?: string | null; achieved?: boolean | null; evaluation_state?: 'pending' | 'evaluated' | 'failed' | 'blocked'; school_id?: string | null; class_id?: string | null; space_id?: string | null; submission_parts?: Json; rubric_notes?: Json; assigned_by?: string | null; source?: 'self' | 'assigned' };
        Update: Partial<Database['public']['Tables']['practice_records']['Insert']>;
      };
      /** 非对话式学习产物：实验报告、代码、扫描件。与检索资料 documents 分表。 */
      submissions: {
        Row: { id: string; owner_id: string; space_id: string | null; project_id: string | null; class_id: string | null; school_id: string | null; assignment_id: string | null; kind: string; title: string; content: string | null; parts: Json; blob_paths: string[]; submitted_at: string; updated_at: string; review_state: 'pending' | 'reviewed' | 'returned' };
        Insert: { owner_id: string; space_id?: string | null; project_id?: string | null; class_id?: string | null; school_id?: string | null; assignment_id?: string | null; kind?: string; title: string; content?: string | null; parts?: Json; blob_paths?: string[]; review_state?: 'pending' | 'reviewed' | 'returned' };
        Update: Partial<Database['public']['Tables']['submissions']['Insert']>;
      };
      /** 教师发起 → 学生完成。没有它，产品只有「问答 + 事后核实」一条主循环。 */
      assignments: {
        Row: { id: string; space_id: string | null; class_id: string | null; school_id: string | null; created_by: string; title: string; instructions: string | null; kind: AssignmentKind; target_level: number | null; due_at: string | null; status: 'open' | 'closed'; created_at: string; updated_at: string };
        Insert: { space_id?: string | null; class_id?: string | null; school_id?: string | null; created_by: string; title: string; instructions?: string | null; kind?: AssignmentKind; target_level?: number | null; due_at?: string | null; status?: 'open' | 'closed' };
        Update: Partial<Database['public']['Tables']['assignments']['Insert']>;
      };
      assignment_recipients: {
        Row: { assignment_id: string; profile_id: string; delivered_at: string; completed_at: string | null };
        Insert: { assignment_id: string; profile_id: string; completed_at?: string | null };
        Update: Partial<Database['public']['Tables']['assignment_recipients']['Insert']>;
      };
      /** 学生对核实结论的申诉：核实此前是不可逆终点，学生没有渠道反驳。 */
      verification_appeals: {
        Row: { id: string; conversation_id: string; raised_by: string; school_id: string | null; space_id: string | null; class_id: string | null; body: string; state: 'open' | 'upheld' | 'withdrawn'; resolution_note: string | null; resolved_by: string | null; resolved_at: string | null; created_at: string; updated_at: string };
        Insert: { conversation_id: string; raised_by: string; body: string; school_id?: string | null; space_id?: string | null; class_id?: string | null };
        Update: Partial<Database['public']['Tables']['verification_appeals']['Insert']>;
      };
      /** AI 预审的评价维度：此前是提示词里写死的一句自然语言 bullet。 */
      review_dimensions: {
        Row: { id: string; school_id: string | null; label_key: string; display_name: string; criteria: string; default_severity: 'low' | 'medium' | 'high'; prompt_fragment: string; sort_order: number; enabled: boolean; created_at: string; updated_at: string };
        Insert: { school_id?: string | null; label_key: string; display_name: string; criteria: string; default_severity?: 'low' | 'medium' | 'high'; prompt_fragment: string; sort_order?: number; enabled?: boolean };
        Update: Partial<Database['public']['Tables']['review_dimensions']['Insert']>;
      };
      /** 评价层级：从 check 约束进表，Bloom 六层只是它的默认实现。 */
      rubric_levels: {
        Row: { id: string; school_id: string | null; space_id: string | null; level_key: string; ordinal: number; name: string; operation: string; hint: string | null; requires_previous: boolean; enabled: boolean };
        Insert: { school_id?: string | null; space_id?: string | null; level_key: string; ordinal: number; name: string; operation: string; hint?: string | null; requires_previous?: boolean; enabled?: boolean };
        Update: Partial<Database['public']['Tables']['rubric_levels']['Insert']>;
      };
      /** 教学场景：与模型能力拆成两个枚举，加一种教学形态不必发明一个模型能力。 */
      teaching_scenarios: {
        Row: { key: string; display_name: string; description: string | null; sort_order: number; enabled: boolean };
        Insert: { key: string; display_name: string; description?: string | null; sort_order?: number; enabled?: boolean };
        Update: Partial<Database['public']['Tables']['teaching_scenarios']['Insert']>;
      };
      /** AI 用量：先有计量，再谈配额。 */
      ai_usage: {
        Row: { id: string; occurred_at: string; school_id: string | null; organization_id: string | null; profile_id: string | null; scenario: string; model_id: string | null; provider_id: string | null; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; request_id: string | null; error_code: string | null };
        Insert: { school_id?: string | null; organization_id?: string | null; profile_id?: string | null; scenario: string; model_id?: string | null; provider_id?: string | null; input_tokens?: number | null; output_tokens?: number | null; request_id?: string | null; error_code?: string | null };
        Update: Partial<Database['public']['Tables']['ai_usage']['Insert']>;
      };
      app_log_events: {
        Row: { id: string; created_at: string; level: 'debug' | 'info' | 'warn' | 'error'; area: string; event: string; route: string | null; method: string | null; status: number | null; request_id: string | null; message: string | null; digest: string | null; context: Json | null; school_id: string | null; organization_id: string | null; duration_ms: number | null };
        Insert: { id?: string; created_at?: string; level: 'debug' | 'info' | 'warn' | 'error'; area: string; event: string; route?: string | null; method?: string | null; status?: number | null; request_id?: string | null; message?: string | null; digest?: string | null; context?: Json | null; school_id?: string | null; organization_id?: string | null; duration_ms?: number | null };
        Update: Partial<Database['public']['Tables']['app_log_events']['Insert']>;
      };
      audit_records: {
        Row: { id: string; source_message_id: string; source_conversation_id: string; auditor_id: string | null; class_id: string | null; school_id: string | null; space_id: string | null; kind: AuditKind; status: AuditStatus; quality: string | null; prompt: string; original_answer: string | null; corrected_answer: string | null; chosen_answer: string | null; rejected_answer: string | null; rationale: string | null; metadata: Json; dimension_key: string | null; teacher_comment: string | null; exported_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; source_message_id: string; source_conversation_id: string; auditor_id?: string | null; class_id?: string | null; school_id?: string | null; space_id?: string | null; kind: AuditKind; status?: AuditStatus; quality?: string | null; prompt: string; original_answer?: string | null; corrected_answer?: string | null; chosen_answer?: string | null; rejected_answer?: string | null; rationale?: string | null; metadata?: Json; dimension_key?: string | null; teacher_comment?: string | null; exported_at?: string | null };
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
      /** 建空间 + 写主题/科目/颜色 + 拉一个班；同名活跃空间幂等复用。 */
      create_space_v2: {
        Args: { p_name: string; p_theme: string; p_class_id?: string | null; p_subject?: string | null; p_color_key?: SpaceColorKey };
        Returns: string;
      };
      create_space_v3: {
        Args: { p_name: string; p_theme: string; p_class_id?: string | null; p_subject?: string | null; p_color_key?: SpaceColorKey; p_space_kind?: SpaceKind };
        Returns: string;
      };
      /** 再拉一个班。返回新增边数：0 表示本来就在。 */
      pull_class_into_space: {
        Args: { p_space_id: string; p_class_id: string };
        Returns: number;
      };
      update_own_subject: {
        Args: { p_subject: string | null };
        Returns: string | null;
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
      /**
       * 学生迁班，一个事务：删旧 membership + 插新 membership + 迁移
       * projects / conversations.class_id。返回被改动的行数。
       */
      transfer_student_to_class: {
        Args: { p_profile_id: string; p_class_id: string };
        Returns: number;
      };
      /**
       * 增量加入一个班级：不删旧关系、不改历史。返回 1=新插入，2=已在此班并提升为主班，
       * 0=已在此班且未提升主班（幂等重放，不是失败）。
       */
      add_class_membership: {
        Args: { p_profile_id: string; p_class_id: string; p_is_primary?: boolean };
        Returns: number;
      };
      /** 移除单个班级关系（不再是「移出即清空全部」），返回删除行数。 */
      remove_class_membership: {
        Args: { p_profile_id: string; p_class_id: string };
        Returns: number;
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
      /** 按学校与天汇总用量：先有计量，再谈配额。 */
      ai_usage_daily: { Args: { p_from: string; p_to: string }; Returns: Json[] };
      record_ai_usage: { Args: { p_school_id: string | null; p_organization_id: string | null; p_profile_id: string | null; p_scenario: string; p_model_id: string | null; p_provider_id: string | null; p_input_tokens: number | null; p_output_tokens: number | null; p_request_id?: string | null; p_error_code?: string | null }; Returns: undefined };
      can_read_space: { Args: { p_space_id: string }; Returns: boolean };
      can_read_space_row: { Args: { p_space_id: string; p_owner_id: string; p_school_id: string | null; p_organization_id: string | null }; Returns: boolean };
      teacher_space_ids: { Args: Record<string, never>; Returns: string[] };
      teacher_can_access_space: { Args: { p_space_id: string }; Returns: boolean };
      storage_path_owner: { Args: { p_name: string }; Returns: string | null };
      save_scenario_tier_bindings_and_sync: { Args: { p_bindings: Json }; Returns: undefined };
    };
    Enums: { app_role: AppRole; model_tier: ModelTier; provider_capability: ProviderCapability; prompt_preset_status: PromptPresetStatus; interaction_source: InteractionSource; audit_kind: AuditKind; audit_status: AuditStatus; export_status: ExportStatus };
    CompositeTypes: Record<string, never>;
  };
}
