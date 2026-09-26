"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// 关联基线：调用方漏写 htmlFor 是最常见的表单无障碍缺口。
// 这里只做零风险的一半——唯一的子元素自带 id 时，把它回填给 htmlFor。
// 不反过来给控件发号：Base UI 的 Select/Dialog 未必接受硬塞的 id。
function Label({ className, children, htmlFor, ...props }: React.ComponentProps<"label">) {
  // 直接用 isValidElement 判子节点本身：Children.count("<Label>密码</Label>") 也等于 1，
  // 再交给 Children.only 会在纯文本 Label 上抛错，整页 500。
  const childId = React.isValidElement<{ id?: string }>(children) ? children.props.id : undefined;
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      htmlFor={htmlFor ?? childId}
      {...props}
    >
      {children}
    </label>
  )
}

export { Label }
