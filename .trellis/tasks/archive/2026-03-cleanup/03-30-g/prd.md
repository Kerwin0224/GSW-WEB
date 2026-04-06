# 模块 G：导出与模板

## 目标

把结构化结果对象和聊天记录稳定导出为教师可用的 Word 文件，并保留 JSON 归档。

## 交付内容

- `lesson_outline` / `question_analysis` / 会话记录导出
- Word 模板渲染
- JSON 全量备份
- 导出失败回退

## 验收

1. `ready` 状态结果可导出，`draft` 不可导出。
2. Word 导出失败时能返回 JSON 备份。
3. 文件命名、附录和证据引用符合 `export-spec.md`。
