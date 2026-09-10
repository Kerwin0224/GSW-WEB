import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import pluginNext from "@next/eslint-plugin-next";
import pluginReact from "@ternaus/eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// 不用 eslint-config-next：它把 eslint-plugin-react 锁死在 7.x（已停止维护、不支持
// ESLint 10，见 next.js#89764 / jsx-eslint#3977）。改为按 Next 官方文档直接组合
// @next/eslint-plugin-next，react/* 规则由 React 19 续作 @ternaus/eslint-plugin-react 提供。
const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginReactHooks.configs.flat.recommended,
  {
    plugins: { "@next/next": pluginNext },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // 与原 eslint-config-next 行为对齐：未用变量只提示不阻塞
      "@typescript-eslint/no-unused-vars": "warn",
      // fork 的 flat recommended 新增的风格建议，存量代码按提示处理
      "react/prefer-use-state-lazy-initialization": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
