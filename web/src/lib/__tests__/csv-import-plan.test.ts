import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planRows, succeededRowCount, type CsvPlanRow } from '../../app/admin/users/csv-import-plan.ts';

const row = (over: Partial<CsvPlanRow> & Pick<CsvPlanRow, 'rowNumber' | 'loginId' | 'status'>): CsvPlanRow => ({
  displayName: '张三',
  role: 'student',
  errors: [],
  subject: null,
  className: null,
  ...over,
});

test('分类：新建 / 覆盖 / 角色变化 / 本批重复 / 有错误', () => {
  const plans = planRows(
    [
      row({ rowNumber: 2, loginId: '20150001', status: 'valid' }),
      row({ rowNumber: 3, loginId: '20150002', status: 'valid' }),
      row({ rowNumber: 4, loginId: '20150001', status: 'valid' }),
      row({ rowNumber: 5, loginId: '20150003', status: 'invalid', errors: ['login_id 在文件内重复'] }),
      row({ rowNumber: 6, loginId: '20150002', status: 'valid', willUpdate: true, existingRole: 'teacher' }),
    ],
    [{ loginId: '20150001', displayName: '张三', role: 'student' }],
  );

  assert.deepEqual(plans.map((plan) => plan.kind), ['update', 'create', 'duplicate', 'invalid', 'role-change']);
  // 本批重复要指回第一次出现的行号，覆盖行要带上既有角色。
  assert.equal(plans[2].duplicateOfRow, 2);
  assert.equal(plans[4].existingRole, 'teacher');
});

test('失败行号回推已成功行数，忽略 invalid 行；服务端给了计数就以它为准', () => {
  const plans = planRows(
    [
      row({ rowNumber: 2, loginId: '20150001', status: 'valid' }),
      row({ rowNumber: 3, loginId: '20150003', status: 'invalid', errors: ['缺少 subject'] }),
      row({ rowNumber: 4, loginId: '20150002', status: 'valid' }),
      row({ rowNumber: 5, loginId: '20150004', status: 'valid' }),
    ],
    [],
  );

  assert.equal(succeededRowCount('第 5 行导入失败：角色不合法', plans), 2);
  assert.equal(succeededRowCount('第 5 行导入失败：角色不合法', plans, 0), 0);
  assert.equal(succeededRowCount('导入失败', plans), null);
});
