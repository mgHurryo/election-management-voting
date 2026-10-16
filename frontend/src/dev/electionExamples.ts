import type { Election } from '../api/types'

// This module is only imported by the development-only preview route.
export const exampleElections: Election[] = [
  ['1001', '示例：班长选举', '班长', 'DRAFT'],
  ['1002', '示例：学习委员选举', '学习委员', 'OPEN'],
  ['1003', '示例：社团负责人选举', '负责人', 'CLOSED'],
  ['1004', '示例：体育委员选举', '体育委员', 'DRAFT'],
  ['1005', '示例：活动代表选举', '活动代表', 'OPEN'],
  ['1006', '示例：小组代表选举', '小组代表', 'CLOSED'],
  ['1007', '示例：生活委员选举', '生活委员', 'DRAFT'],
].map(([id, title, position_title, status]) => ({
  id: id!,
  title: title!,
  position_title: position_title!,
  status: status as Election['status'],
  description: '用于查看界面效果的虚构数据。',
  created_by: '1',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: null,
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
}))
