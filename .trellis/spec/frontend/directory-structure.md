# Frontend Directory Structure

---

## Root Layout

```
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # 快速提问页
│   ├── question/
│   │   └── page.tsx                # 题目解析页
│   ├── projects/
│   │   ├── page.tsx                # 学习项目列表
│   │   └── [project_id]/
│   │       └── page.tsx            # 学习项目详情
│   ├── trajectory/
│   │   ├── page.tsx                # 学习轨迹（学生视图）
│   │   └── class/
│   │       └── page.tsx            # 全班掌握度矩阵（教师视图）
│   └── admin/
│       ├── traces/
│       │   └── page.tsx
│       └── skills/
│           └── page.tsx
├── components/
│   ├── chat/                       # ChatInput / ResultCard / HintLadder / TaskSwitcher
│   ├── project/                    # ProjectCard / MaterialList / ResultList / ExportPanel
│   ├── review/                     # ReviewPanel
│   ├── trajectory/                 # TrajectoryTree / MasteryMatrix / BloomBadge / FeedbackEditor
│   ├── admin/                      # TraceViewer / SkillManager / McpToolList / TemplateEditor
│   └── shared/                     # RoleSwitch / WebSearchToggle / StatusBadge
├── lib/
│   ├── api.ts
│   ├── types.ts
│   ├── constants.ts
│   └── bloom.ts
└── public/
```

## Key Conventions

- 路由与 PRD 保持一致，统一使用 `projects/` 而不是 `project/`
- 学生、教师、管理员是同一套应用下的不同权限视图，不拆成三套站点
- 任何涉及布鲁姆层级显示的组件都使用 `lib/bloom.ts` 映射，不在组件内硬编码中文
- 所有结果区域必须完整处理六种状态：`loading / error / empty / result / review_pending / exported`
