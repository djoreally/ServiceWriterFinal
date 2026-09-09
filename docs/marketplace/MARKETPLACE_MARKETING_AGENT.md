# Marketplace Marketing Agent

Status: FUTURE SYSTEM / NOT IMPLEMENTED

The Marketplace Marketing Agent is a supervised growth-operations system for local market cells. It must never be represented as live until its data inputs, execution controls, spend limits, attribution, rollback, and human-approval paths have been production-certified.

## Objective

Maximize qualified marketplace demand within provider capacity and approved co-op budgets while preserving truthful attribution, provider fairness, and human control.

The agent optimizes the marketplace, not an individual provider's private advertising account unless a separate explicit product supports that use case.

## Inputs

The agent may consume only authorized, provenance-bearing data, including:

- market-cell activation state
- provider density and service-area coverage
- near-term appointment capacity
- service-category availability
- marketplace discovery and booking conversion
- completed/cancelled booking outcomes
- measured campaign spend
- measured clicks/impressions/conversions
- CAC/CPA by market/category/campaign
- landing-page performance
- provider response/completion quality
- approved budget policy
- approved brand/creative policy

## Outputs

Initially recommendation-only:

- increase/decrease/pause budget
- launch or pause campaign
- keyword/negative-keyword recommendations
- creative refresh recommendations
- landing-page recommendations
- market-supply warning
- provider-recruitment recommendation
- seasonal campaign recommendation
- anomaly alert

Later, approved low-risk actions may be automated within strict limits.

## Control model

Every action class has a maximum autonomous authority.

### Human-only

- change co-op pricing
- change booking-fee policy
- open/close a market for commercial reasons
- exceed approved market budget
- materially change brand positioning
- create legal/compliance claims
- resolve provider disputes
- change attribution rules

### Approval required before execution

- launch a new paid campaign
- materially reallocate budget between markets
- increase a campaign budget above an approved threshold
- publish a new creative concept outside approved templates
- alter targeting geography beyond the approved market cell

### Potentially autonomous after certification

- pause an underperforming campaign within policy
- reduce spend to respect capacity
- add approved negative keywords
- rotate pre-approved creative variants
- shift limited budget among approved campaigns in the same market

## Capacity-first rule

The agent must not buy demand the network cannot serve.

Before recommending or executing additional spend, it should evaluate:

- open capacity in the requested period
- category coverage
- geographic coverage
- provider availability
- completion/cancellation quality
- backlog and response time

A hard market-capacity stop overrides optimization goals.

## Spend safety

Required controls:

- market-level daily/monthly caps
- campaign-level caps
- maximum percentage change per action
- cooldown after material changes
- anomaly detection
- emergency pause
- immutable execution log
- idempotency keys for external mutations
- read-back verification after mutation
- explicit currency handling

No action is successful merely because an advertising API returned 2xx. The system must read back the resulting state.

## Recommendation evidence packet

Every recommendation must include:

- market cell
- objective
- measured evidence window
- current state
- proposed change
- expected mechanism, not fabricated outcome
- risk level
- budget effect
- capacity check
- attribution confidence
- source references/IDs

The system must not claim predicted ROI as guaranteed revenue.

## Human growth manager

A human growth manager remains the strategic authority. Their dashboard should show:

- market health
- provider supply/capacity
- spend and CAC/CPA
- active recommendations
- pending approvals
- anomalies
- attribution gaps
- provider statement readiness

The first practical operating model can be one human supervising the agent across multiple local cells, rather than a full traditional agency team for each city.

## Rollout phases

1. Read-only analyst
2. Recommendation generator
3. Human-approved execution
4. Limited autonomous low-risk execution
5. Multi-market optimization under fixed policy

Each phase requires separate certification. No later phase inherits GREEN from an earlier phase.
