import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/workbench/state-surfaces';

export const capabilities = [
  'student_chat',
  'teacher_chat',
  'bloom_classification',
  'project_classification',
  'practice_generation',
  'practice_evaluation',
  'audit_assist',
  'embedding',
] as const;

interface ProviderRow {
  name: string;
  model: string;
  maskedKey: string;
  enabled: Partial<Record<(typeof capabilities)[number], boolean>>;
}

export function ProviderCapabilityMatrix({ providers }: { providers: ProviderRow[] }) {
  if (providers.length === 0) {
    return (
      <EmptyState
        title="尚未配置模型 Provider"
        description="学生对话、教师对话、布鲁姆分类、练习生成与导出辅助都会保持阻塞，直到管理员配置真实 Provider。"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider / Model</TableHead>
            <TableHead>密钥</TableHead>
            {capabilities.map((capability) => <TableHead key={capability}>{capability}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <TableRow key={`${provider.name}-${provider.model}`}>
              <TableCell className="font-medium">{provider.name}<br /><span className="text-xs text-muted-foreground">{provider.model}</span></TableCell>
              <TableCell>{provider.maskedKey}</TableCell>
              {capabilities.map((capability) => (
                <TableCell key={capability}>
                  <Badge variant={provider.enabled[capability] ? 'default' : 'secondary'}>{provider.enabled[capability] ? '启用' : '未启用'}</Badge>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
