import { useState } from 'react'
import type { Candidate } from '../../api/types'
import './ElectionDetailView.css'

export function CandidateProfile({ candidate }: { candidate: Candidate }) {
  const [failed, setFailed] = useState(false)
  const photo = candidate.photo_url?.startsWith('https://') ? candidate.photo_url : null
  return (
    <article className="candidate-profile" aria-label={`候选人：${candidate.name}`}>
      {photo && !failed ? (
        <img
          src={photo}
          alt={`${candidate.name}的照片`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="candidate-photo-placeholder">{failed ? '照片暂不可用' : '未提供照片'}</div>
      )}
      <div className="candidate-profile-text">
        <h3>{candidate.name}</h3>
        <p>竞选职位：{candidate.position_title}</p>
        <p className="candidate-description">{candidate.description}</p>
      </div>
    </article>
  )
}
