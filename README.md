# Classical Chinese Workbench

> **V1 早期版本** — 前端界面尚未完善，后端核心逻辑也处于起步阶段。
> 当前代码主要用于演示产品方向和团队内部讨论，不建议直接用于生产环境。

古诗文 AI 工作台 — 面向学校场景的学生、教师、管理员三端协同平台。

## Current Status (V1)

| 模块 | 状态 | 说明 |
|------|------|------|
| 学生端 | 基础可用 | 登录、对话、Bloom 层级展示、挑战入口已实现，UI 待完善 |
| 教师端 | 基础可用 | 学习状态总览、学生项目查看、反馈功能已实现，review 流程待完善 |
| 管理员端 | 基础可用 | 全校概览、能力配置、审计查看已实现，数据生产模式待完善 |
| 后端 API | 起步阶段 | 认证、用户管理、项目/会话 CRUD 已实现，LangGraph 编排链路待优化 |
| AI 能力 | 实验阶段 | 支持 Ollama 本地推理和 Grok API，RAG 检索链路待完善 |
| 数据层 | 可用 | SQLite + Chroma 已跑通，演示数据可一键重置 |

**一句话总结：** 产品方向已确定，三端框架已搭好，但每个端都有大量细节需要补全。

## What This Is

一个以 Bloom 认知层级递进为核心的古诗文学习 AI 工作台，包含：

- **学生端**：问题驱动的学习工作台，支持对话、文件上传、联网搜索、Bloom 层级展示与进阶挑战
- **教师端**：学习状态总览 + 学生项目复核与干预工作台
- **管理员端**：全校 Bloom 分布、审计追踪、能力配置与训练数据生产

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- npm
- (Optional) Ollama — 用于本地模型推理

### 1. Install Dependencies

```powershell
# Python backend
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt

# Node.js frontend
cd frontend
npm install
cd ..
```

### 2. Configure Environment

```powershell
cp .env.example .env
```

编辑 `.env` 设置模型提供商和 API 密钥。默认配置适用于 Ollama 本地推理。

### 3. Seed Demo Data

```powershell
python backend/scripts/reset_demo_data.py
```

### 4. Start the Stack

推荐一键启动：

```powershell
.\scripts\start-demo.ps1 -ResetDemoData
```

或分别启动：

```powershell
# Backend
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

# Frontend (新终端窗口)
cd frontend
npm run dev
```

访问地址：
- 前端: `http://127.0.0.1:3000`
- 后端 API: `http://127.0.0.1:8000`
- API 文档: `http://127.0.0.1:8000/docs`

## Demo Accounts

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | `admin` | `admin123456` |
| 教师 | `teacher` | `teacher123456` |
| 学生 | `student` | `student123456` |
| 学生（补充样例） | `student_a` | `student123456` |

## Documentation

| 文档 | 说明 |
|------|------|
| [产品真相](docs/PRODUCT_SOURCE_OF_TRUTH.md) | 产品方向与核心决策入口 |
| [PRD 决策](docs/prd_decision_v1.md) | 产品需求决策文档 |
| [演示范围](docs/demo_scope_v1.md) | 当前演示包含/不包含的功能 |
| [架构概览](docs/ARCHITECTURE.md) | 系统架构、目录结构与数据流 |
| [API 参考](docs/API_REFERENCE.md) | 后端 API 端点文档 |
| [开源复用映射](docs/open_source_reuse_module_mapping_v1.md) | 开源项目复用策略 |
| [贡献指南](.github/CONTRIBUTING.md) | 开发流程、代码规范与 PR 指南 |
| [团队交接](docs/TEAM_HANDOFF.md) | 仓库整理说明与协作约定 |

## Project Structure

```
├── backend/              # FastAPI + LangGraph 后端
│   ├── app/              # 业务代码
│   │   ├── graph/        # LangGraph 工作流节点
│   │   ├── mcp/          # MCP 提供商与运行时桥接
│   │   └── skills/       # AI 技能实现
│   ├── scripts/          # 演示数据重置、冒烟测试
│   └── requirements.txt
├── frontend/             # Next.js 前端
│   ├── app/              # 页面路由
│   ├── components/       # React 组件
│   └── lib/              # API 客户端、类型、工具
├── docs/                 # 产品与架构文档
├── scripts/              # 启动脚本
├── models/               # 本地模型目录（占位，不入库）
├── data/                 # 运行时数据（gitignored）
└── exports/              # 导出文件（gitignored）
```

## Development

### Validation

```powershell
# Frontend
cd frontend
npm run typecheck
npm run lint

# Backend smoke tests
python backend/scripts/smoke_admin_visibility.py
python backend/scripts/smoke_challenge_flow.py
```

### What NOT to Commit

以下内容已通过 `.gitignore` 屏蔽，请勿手动提交：

- `data/` — SQLite 数据库与 Chroma 索引
- `exports/` — 导出文件
- `models/` — 模型二进制文件
- `.env` — 密钥与配置
- `*.log` — 运行日志
- `__pycache__/`, `node_modules/`, `.next/` — 构建产物

### Reset Demo Data

任何时候都可以安全地重新生成演示数据：

```powershell
python backend/scripts/reset_demo_data.py
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS, SWR, Zod
- **Backend**: FastAPI, LangGraph, Pydantic, ChromaDB, SQLite
- **AI**: Ollama (local), xAI Grok API (cloud), UltraRAG (optional)
- **Observability**: Langfuse (optional)

## License

See [LICENSE](LICENSE).
