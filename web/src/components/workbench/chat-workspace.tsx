'use client';

import { useState, type ReactNode, type RefObject } from 'react';
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse';
import { cn } from '@/lib/utils';

/**
 * 聊天工作区的统一外壳（学生端 / 教师端共用）。
 *
 * 背景：两端此前各写了一份"grid(侧栏 + 主区) + 收起钮 + 头部 + 滚动消息区 + 底部 composer"，
 * 结构同构但类名细节漂移，教师端因此看起来像另一套产品——用户定性为"未充分复用统一模板"。
 * 这里把骨架收口到一处，且**保留学生端（参考实现）的原始类名**，使教师端在结构上对齐它。
 *
 * 折叠状态由外壳自己持有（按 storageKey 记忆），两端不必再各自管这份 state。
 * 真正不同的业务（项目树 / 模板面板 / 消息渲染）仍留在各自客户端，通过 slot 传入。
 *
 * 四个槽：sidebar / header / messages / footer。footer 是底部动作区——
 * 两端放输入框（composer），教师学习记录核实放会话级动作条（AI 预审 + 最终提交）。
 * 槽名不叫 composer，因为它装的不一定是输入框。
 */
export function ChatWorkspace({
  storageKey,
  sidebarLabel,
  sidebarWidth = 'default',
  mainLabel,
  sidebarRef,
  sidebarPrimaryAction,
  sidebar,
  header,
  messages,
  footer,
  scrollRef,
  mobileComposerFirst = false,
  mobileSelectionActive,
  backToQueueLabel = '返回列表',
}: {
  /** 折叠状态的 localStorage key；两端各记各的。 */
  storageKey: string;
  /** 侧栏的 aria-label。 */
  sidebarLabel: string;
  /**
   * 侧栏宽度档位。默认档贴合聊天两端（两级层级：项目 → 会话）；
   * 学习记录核实的队列是四级（班级 → 学生 → 项目 → 会话），缩进更深，需要更宽的一档。
   * 用档位而不是让调用方传类名：宽度是外壳的职责，散到调用方就没人知道整体版式长什么样。
   */
  sidebarWidth?: 'default' | 'wide';
  /** 主区的 aria-label；不传则沿用 sidebarLabel。 */
  mainLabel?: string;
  sidebarRef?: RefObject<HTMLElement | null>;
  /** 侧栏首行主操作（学生端"开始新会话"）。用 render 函数是因为它的尺寸随折叠态变化。 */
  sidebarPrimaryAction?: (collapsed: boolean) => ReactNode;
  sidebar: ReactNode;
  header: ReactNode;
  messages: ReactNode;
  /** 底部动作区。不传则整条底栏不渲染（只读视图不需要它）。 */
  footer?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  mobileComposerFirst?: boolean;
  /**
   * 移动端「队列 ↔ 详情」二选一。桌面端（lg 以上）永远并排，这个开关只影响窄屏。
   *
   * 之前两端在窄屏都是「侧栏在上、详情在下」纵向堆叠：教师在手机上核实会话时，
   * 点开会话后队列仍占着半屏，通读要滚很久才看见底部提交条。
   */
  mobileSelectionActive?: boolean;
  /** 详情态下回到队列的按钮文案。 */
  backToQueueLabel?: string;
}) {
  const { collapsed, toggle } = useSidebarCollapse(storageKey);

  // 只记「用户是否手动退回队列」；选中态一变就重置，
  // 否则上一条会话点过的「返回队列」会漏到下一条上。
  const [showQueue, setShowQueue] = useState(false);
  const [lastSelection, setLastSelection] = useState(mobileSelectionActive);
  if (mobileSelectionActive !== lastSelection) {
    setLastSelection(mobileSelectionActive);
    setShowQueue(false);
  }
  // 不传 mobileSelectionActive = 保持原来的纵向堆叠（学生端就是这个形态）。
  // 这个开关必须是 opt-in 的：默认 false 会让窄屏下的学生端主区直接消失。
  const paneMode = mobileSelectionActive !== undefined;
  const detailOnly = paneMode && mobileSelectionActive && !showQueue;

  return (
    <div
      className={cn(
        'grid min-h-0 w-full flex-1 bg-background/35 transition-all duration-300',
        collapsed
          ? 'lg:grid-cols-[3.5rem_minmax(0,1fr)]'
          : sidebarWidth === 'wide'
            ? 'lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]'
            : 'lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]',
      )}
    >
      <aside
        ref={sidebarRef}
        className={cn(
          'order-2 border-t border-border/60 bg-card/72 backdrop-blur-xl transition-all duration-300 lg:order-1 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0',
          collapsed ? 'lg:w-[3.5rem] lg:p-1.5' : 'lg:w-auto lg:p-3',
          detailOnly && 'hidden lg:block',
        )}
        aria-label={sidebarLabel}
      >
        {/* 首行：有主操作时并排（展开态按钮占满剩余宽度），否则只有收起钮。 */}
        <div className={cn('flex gap-2', collapsed ? 'flex-col items-center' : 'flex-row items-stretch')}>
          {sidebarPrimaryAction?.(collapsed)}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
          </button>
        </div>
        <div className={cn('space-y-4 pt-3 transition-opacity duration-300', collapsed && 'lg:hidden')}>
          {sidebar}
        </div>
      </aside>

      <section className={cn('order-1 min-h-0 min-w-0 flex-col lg:order-2 lg:h-full', paneMode ? (detailOnly ? 'flex' : 'hidden lg:flex') : 'flex')} aria-label={mainLabel ?? sidebarLabel}>
        {/* 返回队列只在窄屏的详情态出现；桌面端队列常驻，不需要这个出口。 */}
        {detailOnly ? (
          <div className="shrink-0 border-b border-border/60 px-4 py-2 sm:px-6 lg:hidden">
            <button
              type="button"
              onClick={() => setShowQueue(true)}
              className="flex min-h-10 cursor-pointer items-center gap-1 rounded-lg px-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              {backToQueueLabel}
            </button>
          </div>
        ) : null}
        <div className="shrink-0 border-b border-border/60 bg-card/92 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
          <div className="mx-auto max-w-3xl space-y-1.5">{header}</div>
        </div>

        <div
          ref={scrollRef}
          className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-7', mobileComposerFirst ? 'order-3 lg:order-2' : 'order-2')}
        >
          <div className="mx-auto max-w-3xl space-y-6">{messages}</div>
        </div>

        {footer ? (
          <div
            className={cn(
              // 窄屏下滚动发生在外壳的 #workspace-main，动作条必须 sticky 才不会随长会话滚走。
              'sticky bottom-0 z-20 border-t border-border/60 bg-card/92 p-4 backdrop-blur sm:px-6 lg:static',
              mobileComposerFirst ? 'order-2 lg:order-3' : 'order-3',
            )}
          >
            <div className="mx-auto max-w-2xl">{footer}</div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
