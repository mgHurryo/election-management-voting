export type ID = string
export type Role = 'ADMIN' | 'USER'
export type ElectionStatus = 'DRAFT' | 'OPEN' | 'CLOSED'
export interface Timestamps {
  created_at: string
  updated_at: string
}
export interface User extends Timestamps {
  id: ID
  username: string
  display_name: string
  role: Role
  status: 'ACTIVE' | 'DISABLED'
}
export interface Election extends Timestamps {
  id: ID
  title: string
  position_title: string
  description: string | null
  created_by: ID
  status: ElectionStatus
  privacy_mode: 'FORCED_ANONYMOUS'
  starts_at: string
  ends_at: string
  results_published_at: string | null
}
export interface Candidate extends Timestamps {
  id: ID
  election_id: ID
  name: string
  position_title: string
  description: string
  photo_url: string | null
  display_order: number
}
export interface Voter extends Timestamps {
  election_id: ID
  user_id: ID
  display_name: string
  vote_quota: 1
}
export interface Participation {
  election_id: ID
  eligible: boolean
  vote_quota: number
  used_votes: number
  remaining_votes: number
}
export interface Ballot {
  election: Election
  candidates: Candidate[]
  participation: Participation
}
export interface Result {
  election_id: ID
  position_title: string
  results_published_at: string | null
  total_votes: number
  candidates: { candidate_id: ID; name: string; vote_count: number }[]
  winner_candidate_id: ID | null
}
export interface Envelope<T> {
  data: T
}
export interface Paginated<T> extends Envelope<T[]> {
  meta: { page: number; page_size: number; total: number }
}
export interface Login {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}
export interface ElectionInput {
  title: string
  position_title: string
  description?: string | null
  starts_at: string
  ends_at: string
  voter_ids: ID[]
}
export type ElectionPatch = Partial<Omit<ElectionInput, 'voter_ids'>>
export interface CandidateInput {
  name: string
  description: string
  photo_url?: string | null
  display_order?: number
}
export interface ListQuery {
  page?: number
  page_size?: number
  status?: ElectionStatus
}
