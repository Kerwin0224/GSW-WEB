import { CheckCircle2, CircleAlert } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface SetupItem {
  label: string;
  ready: boolean;
  description: string;
  href: string;
}

export function SetupChecklist({ items }: { items: SetupItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="hover:shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{item.label}</CardTitle>
              <Badge variant={item.ready ? 'default' : 'secondary'}>{item.ready ? 'ready' : 'missing'}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{item.description}</p>
            <a href={item.href} className="inline-flex items-center gap-2 font-medium text-foreground underline-offset-4 hover:underline">
              {item.ready ? <CheckCircle2 className="size-4 text-primary" /> : <CircleAlert className="size-4 text-destructive" />}
              查看配置
            </a>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
