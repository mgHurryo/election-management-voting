import { request } from './client'
import type {
  Ballot,
  Candidate,
  CandidateInput,
  Election,
  ElectionInput,
  ElectionPatch,
  Envelope,
  ID,
  ListQuery,
  Login,
  Paginated,
  Participation,
  Result,
  User,
  Voter,
} from './types'
function query(input: ListQuery = {}) {
  const params = new URLSearchParams()
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value))
  })
  return params.size ? `?${params}` : ''
}
const electionPath = (id: ID) => `/elections/${encodeURIComponent(id)}`
export const api = {
  login: (username: string, password: string) =>
    request<Envelope<Login>>('/auth/login', {
      method: 'POST',
      body: { username, password },
      public: true,
    }),
  me: () => request<Envelope<User>>('/auth/me'),
  elections: (params?: ListQuery) => request<Paginated<Election>>(`/elections${query(params)}`),
  election: (id: ID) => request<Envelope<Election>>(electionPath(id)),
  createElection: (body: ElectionInput) =>
    request<Envelope<Election>>('/elections', { method: 'POST', body }),
  updateElection: (id: ID, body: ElectionPatch) =>
    request<Envelope<Election>>(electionPath(id), { method: 'PATCH', body }),
  openElection: (id: ID) =>
    request<Envelope<Election>>(`${electionPath(id)}/open`, { method: 'POST' }),
  closeElection: (id: ID) =>
    request<Envelope<Election>>(`${electionPath(id)}/close`, { method: 'POST' }),
  candidates: (id: ID, page = 1) =>
    request<Paginated<Candidate>>(
      `${electionPath(id)}/candidates${query({ page, page_size: 20 })}`,
    ),
  addCandidate: (id: ID, body: CandidateInput) =>
    request<Envelope<Candidate>>(`${electionPath(id)}/candidates`, { method: 'POST', body }),
  updateCandidate: (id: ID, candidateId: ID, body: Partial<CandidateInput>) =>
    request<Envelope<Candidate>>(
      `${electionPath(id)}/candidates/${encodeURIComponent(candidateId)}`,
      { method: 'PATCH', body },
    ),
  deleteCandidate: (id: ID, candidateId: ID) =>
    request<void>(`${electionPath(id)}/candidates/${encodeURIComponent(candidateId)}`, {
      method: 'DELETE',
    }),
  voters: (id: ID, page = 1) =>
    request<Paginated<Voter>>(`${electionPath(id)}/voters${query({ page, page_size: 20 })}`),
  addVoter: (id: ID, user_id: ID) =>
    request<Envelope<Voter>>(`${electionPath(id)}/voters`, { method: 'POST', body: { user_id } }),
  removeVoter: (id: ID, userId: ID) =>
    request<void>(`${electionPath(id)}/voters/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  ballot: (id: ID) => request<Envelope<Ballot>>(`${electionPath(id)}/ballot`),
  participation: (id: ID) => request<Envelope<Participation>>(`${electionPath(id)}/participation`),
  vote: (id: ID, candidate_id: ID) =>
    request<Envelope<{ election_id: ID; accepted: true }>>(`${electionPath(id)}/votes`, {
      method: 'POST',
      body: { candidate_id },
    }),
  results: (id: ID) => request<Envelope<Result>>(`${electionPath(id)}/results`),
  publishResults: (id: ID) =>
    request<Envelope<Result>>(`${electionPath(id)}/results/publish`, { method: 'POST' }),
}
