import { ApiError } from '../api/client'
const messages: Record<string, string> = {
  INVALID_CREDENTIALS: '用户名或密码不正确，或账户不可用。',
  AUTHENTICATION_REQUIRED: '登录已失效，请重新登录。',
  PERMISSION_DENIED: '当前账户没有执行此操作的权限。',
  NOT_ELIGIBLE: '你不在本场选举的选民名册中。',
  ELECTION_NOT_FOUND: '选举不存在或不在你的可见范围内。',
  CANDIDATE_NOT_FOUND: '候选人不存在。',
  USER_NOT_FOUND: '该用户不存在，请使用已预置的账户 ID。',
  VOTER_NOT_FOUND: '该用户不在名册中。',
  INVALID_VOTER: '仅可添加有效的选民账户。',
  VOTER_ALREADY_EXISTS: '该用户已在名册中。',
  ELECTION_NOT_EDITABLE: '只有草稿选举可以修改。',
  INVALID_STATE_TRANSITION: '选举状态已改变，请刷新后重试。',
  ELECTION_NOT_READY: '请先配置有效候选人与选民名册。',
  ELECTION_NOT_OPEN: '选举尚未开放或已关闭。',
  VOTING_NOT_STARTED: '尚未到达投票开始时间。',
  VOTING_ENDED: '投票时间已结束。',
  VOTE_QUOTA_EXHAUSTED: '你已完成投票，不能重复提交。',
  ELECTION_NOT_CLOSED: '关闭选举后才能计票。',
  RESULTS_NOT_PUBLISHED: '结果尚未发布。',
  RESULT_NOT_DECIDED: '平票或零票，暂无唯一获胜者，不能发布。',
  INVALID_CANDIDATE: '所选候选人无效，请重新获取选票。',
  PRIVACY_MODE_VIOLATION: '本版本仅支持强制匿名投票。',
  VALIDATION_ERROR: '提交字段不符合接口要求，请检查后重试。',
  INVALID_TIME_RANGE: '结束时间必须晚于开始时间。',
  RESOURCE_CONFLICT: '当前资源存在冲突，请刷新后重试。',
  NETWORK_ERROR: '无法连接服务器，请检查网络或后端服务。',
  REQUEST_ABORTED: '请求已超时或取消。',
  INVALID_RESPONSE: '服务器返回了无法识别的响应，请检查 API 配置。',
}
export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? messages[error.code] || '请求失败，请稍后重试。'
    : '操作失败，请检查输入或稍后重试。'
