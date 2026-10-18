import { ApiError } from '../api/client'

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect username or password, or the account is unavailable.',
  AUTHENTICATION_REQUIRED: 'Your session has expired. Please sign in again.',
  PERMISSION_DENIED: 'Your account does not have permission for this action.',
  NOT_ELIGIBLE: 'You are not on the voter roll for this election.',
  ELECTION_NOT_FOUND: 'This election does not exist or is not visible to you.',
  CANDIDATE_NOT_FOUND: 'Candidate not found.',
  CANDIDATE_NOT_EDITABLE: 'Candidates can only be edited while an election is a draft.',
  USER_NOT_FOUND: 'This user does not exist. Use a pre-seeded voter ID.',
  VOTER_NOT_FOUND: 'This user is not on the voter roll.',
  INVALID_VOTER: 'Only valid voter accounts can be added.',
  VOTER_ALREADY_EXISTS: 'This user is already on the voter roll.',
  ELECTION_NOT_EDITABLE: 'Only draft elections can be edited.',
  INVALID_STATE_TRANSITION: 'The election status has changed. Refresh and try again.',
  ELECTION_NOT_READY: 'Add valid candidates and a voter roll before opening.',
  ELECTION_NOT_OPEN: 'This election is not open.',
  VOTING_NOT_STARTED: 'Voting has not started yet.',
  VOTING_ENDED: 'Voting has ended.',
  VOTE_QUOTA_EXHAUSTED: 'You have already voted and cannot vote again.',
  ELECTION_NOT_CLOSED: 'Close the election before counting.',
  RESULTS_NOT_PUBLISHED: 'Results have not been published yet.',
  RESULT_NOT_DECIDED: 'A tie or zero votes: there is no single winner to publish.',
  INVALID_CANDIDATE: 'The selected candidate is invalid. Please refresh your ballot.',
  PRIVACY_MODE_VIOLATION: 'This version supports anonymous voting only.',
  VALIDATION_ERROR: 'Some fields are invalid. Please check and try again.',
  INVALID_TIME_RANGE: 'The end time must be after the start time.',
  RESOURCE_CONFLICT: 'A conflict occurred. Refresh and try again.',
  NETWORK_ERROR: 'Unable to reach the server. Check your network or backend service.',
  REQUEST_ABORTED:
    'The request timed out or was cancelled. A timeout does not mean the operation failed.',
  ROUTE_NOT_FOUND:
    'This service is not available on the current backend. Please try again once it is available.',
  INVALID_RESPONSE: 'The server returned an unrecognized response. Check the API configuration.',
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? messages[error.code] || 'The request failed. Please try again later.'
    : 'The operation failed. Check your input or try again later.'
