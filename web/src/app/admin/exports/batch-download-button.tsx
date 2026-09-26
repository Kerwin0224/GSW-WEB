'use client';

import { useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/**
 * 导出批次下载按钮。
 *
 * 不用 window.location：那是整页导航，移动端（尤其 iOS Safari）会离开当前页面、
 * 甚至把 JSONL 当作文本打开。这里取回 Blob 再触发一次临时 <a download>，
 * 页面不跳转，任何端都按下载处理；失败（无权、批次不存在）就地报错。
 */
export function BatchDownloadButton({ batchId, label = '下载', variant = 'outline', size = 'sm' }: {
  batchId: string;
  label?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'default' | 'lg' | 'icon' | 'icon-sm';
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() => startTransition(async () => {
        try {
          const response = await fetch(`/api/admin/datasets/download?batchId=${batchId}`);
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            toast.error(data?.error ?? `下载失败（HTTP ${response.status}），请到导出历史重新生成批次后下载。`);
            return;
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `dataset-${batchId.slice(0, 8)}.jsonl`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
          toast.success('已开始下载 JSONL 文件。');
        } catch (error) {
          toast.error(`下载失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
      })}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      {pending ? '下载中…' : label}
    </Button>
  );
}
