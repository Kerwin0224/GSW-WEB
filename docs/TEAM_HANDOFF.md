# Team Handoff

这个仓库已经按“团队共享 demo 仓库”整理过一次，下面是当前约定。

## 保留内容

- `frontend/` 和 `backend/` 的业务代码
- `docs/` 中的产品真相和交接说明
- `.trellis/` 中的工作流、规范和任务上下文
- `.github/` 中的协作模板
- `models/README.md` 和 `.gitkeep` 这类占位文件

## 已清理内容

以下内容已经从工作区删除，后续也不应提交：

- 本地运行日志
- Next.js 构建产物
- `node_modules`
- Playwright 截图和浏览器 profile
- `output/` 下的调试产物
- SQLite 数据库和 Chroma 索引
- 本地 GGUF 模型文件
- 根目录散落的临时图片、文档和 `nul`

## 演示数据策略

仓库不再携带数据库文件，而是改为脚本生成：

```powershell
python backend/scripts/reset_demo_data.py
```

这套 demo 数据覆盖了：

- 1 个管理员账号
- 1 个教师账号
- 2 个学生账号
- 学生普通对话
- 学生古诗项目会话
- Bloom 层级与挑战记录
- 教师反馈与教师覆写
- 教师备课结果
- 管理员配置和模板版本

这样每个成员拉下仓库后，都可以得到同一套初始演示状态。

## 推荐协作方式

1. 先跑 `python backend/scripts/reset_demo_data.py`
2. 再跑 `.\scripts\start-demo.ps1 -ResetDemoData`
3. 基于 Trellis 当前任务开发
4. 提交前不要把本地数据、模型和日志带上

## 如果要换成真实数据

- 不要直接把真实数据库提交进仓库
- 新增独立的导入脚本或迁移脚本
- 在 `docs/` 中记录数据来源、脱敏规则和恢复步骤
