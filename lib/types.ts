export type Agreement = { agreement_id:string; creator:string; counterparty:string; title:string; description:string; status:string; created_at:string; frozen_at:string }
export type Requirement = { requirement_id:string; agreement_id:string; statement:string; evaluation_guide:string }
export type Evidence = { evidence_id:string; agreement_id:string; submitter:string; url:string; label:string; submitted_at:string }
export type Adjudication = { adjudication_id:string; agreement_id:string; evidence_id:string; verdict:string; reasoning:string; source_hash:string; completed_at:string }
