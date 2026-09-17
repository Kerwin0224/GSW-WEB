import { redirect } from 'next/navigation';

import { getUser } from '@/lib/auth';
import { ROLE_HOME } from '@/lib/role-home';

export default async function Home() {
  const user = await getUser();
  // 保留 `in` 判断：user.role 的类型虽声明为 AppRole，但那份类型来自镜像 DB 枚举的手写文件，
  // 真出现漂移（DB 加了角色、类型没跟）时这里退到 /login，去掉就会 redirect(undefined)。
  if (user?.role && user.role in ROLE_HOME) redirect(ROLE_HOME[user.role]);
  redirect('/login');
}
