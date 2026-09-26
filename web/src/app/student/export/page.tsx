import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';

/**
 * 学生自导出页。
 *
 * 每个下载项旁边都写清「导出的是什么、不含什么、拿去做什么」：
 * 用户点下载前就该知道拿到的是全量还是片段。缺了这句，
 * 「导出我的数据」就会变成一个没人敢点的按钮——或者一个让人误以为拿到了全部的按钮。
 */

const datasets = [
  {
    key: 'conversations',
    title: '会话正文',
    scope: '你名下全部未删除的学生会话，含你自己的提问、AI 回答、教师修订后的版本与时间。',
    excludes: '不含其他同学的数据；不含教师的核实备注与质量判定。',
    formats: [
      { format: 'md', label: 'Markdown', hint: '适合直接阅读或打印存档' },
      { format: 'json', label: 'JSON', hint: '适合导入自己的笔记工具' },
    ],
  },
  {
    key: 'challenges',
    title: '挑战记录',
    scope: '每次挑战的目标层级、题目、你的作答、反馈与是否通过。',
    excludes: '不含出题模型与评价过程的内部参数。',
    formats: [{ format: 'csv', label: 'CSV', hint: '可用 Excel 打开' }],
  },
  {
    key: 'summary',
    title: '学习记录汇总',
    scope: '按项目汇总的提问条数、挑战次数、通过次数与已确认层级。',
    excludes: '只统计未删除会话里的提问；没有空间的旧项目按全部空间计入。',
    formats: [{ format: 'json', label: 'JSON', hint: '适合交给家长或机构存档' }],
  },
  {
    key: 'attachments',
    title: '附件清单',
    scope: '你上传过的材料标题、所属项目与会话、上传时间与正文长度。',
    excludes: '只导出清单，不打包附件文件本体。',
    formats: [{ format: 'csv', label: 'CSV', hint: '可用 Excel 打开' }],
  },
] as const;

export default function StudentExportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="导出我的数据"
        description="把这学期在这个系统里留下的学习记录拿走存档或转移。导出的都是你自己的数据。"
        primaryAction={{ label: '返回学习记录', href: '/student/me' }}
      />

      <p className="text-sm leading-6 text-muted-foreground">
        导出只包含你本人可见的内容。已经删除的会话不会出现在导出里。若你未满监护人同意的年龄，请先把这份数据交给监护人再对外分享。
      </p>

      <div className="grid gap-4">
        {datasets.map((dataset) => (
          <Card key={dataset.key}>
            <CardHeader>
              <CardTitle className="font-heading">{dataset.title}</CardTitle>
              <CardDescription>{dataset.scope}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{dataset.excludes}</p>
              <div className="flex flex-wrap gap-2">
                {dataset.formats.map((item) => (
                  <Button key={item.format} nativeButton={false} variant="outline" size="sm" render={
                    <Link href={`/api/exports/portability/student?dataset=${dataset.key}&format=${item.format}`}>
                      <Download className="mr-1.5 size-3.5" aria-hidden="true" />
                      {dataset.title} · {item.label}
                      <Badge variant="outline" className="ml-2">{item.hint}</Badge>
                    </Link>
                  } />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button nativeButton={false} variant="ghost" render={<Link href="/student/me"><ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />返回学习记录</Link>} />
    </div>
  );
}
