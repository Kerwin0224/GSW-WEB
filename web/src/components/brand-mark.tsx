/**
 * 文韵智途品牌记号：一笔连成的「书脊 + 三级阶梯」——左边竖直到底代表典籍，
 * 阶梯逐级上升代表读懂、练习、核实的学习递进，两端同高让轮廓读起来仍是一册书。
 *
 * 溯源：与 web/public/brand/mark.svg 同形，路径改动必须两边同步。
 * 颜色跟随 currentColor，尺寸由调用处的 className 决定（与 lucide 图标同款用法）。
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5.5 6v12.3h4.4v-4.1h4.4v-4.1h4.4V6" />
    </svg>
  );
}
