## ADDED Requirements

### Requirement: A pod's price is a flat monthly function of its size

Each pod size SHALL carry a single flat monthly price, defined alongside the size in the shared tier
table, and a pod SHALL be billed that price and nothing else — no metering, no bandwidth or request
charges. The prices SHALL be: Mini $4, Small $7, Medium $12, Large $22, XL $42 per month. Pricing is a
CLOUD-only concern; the self-host edition SHALL NOT show or charge a per-pod price.

#### Scenario: The price shown and billed comes from the size

- **WHEN** an owner views or launches a pod of a given size on the cloud edition
- **THEN** the price presented and billed SHALL be exactly that size's flat monthly price from the tier
  table, with no usage-based component

#### Scenario: Self-host shows no price

- **WHEN** the edition is self-host (`editionOss()`)
- **THEN** no per-pod price SHALL be displayed or charged, though the size's resources still apply

### Requirement: Billing is flat monthly, prorated only on the first partial month

A running pod SHALL accrue its size's flat monthly price. Only the FIRST partial month SHALL be
prorated; thereafter the pod SHALL be billed the whole monthly price per billing period regardless of
how many hours it ran. Deleting a pod SHALL stop further accrual.

#### Scenario: First partial month is prorated

- **WHEN** a pod is created partway through a billing period
- **THEN** the first charge SHALL be prorated to the remaining fraction of that period, and every
  subsequent period SHALL be the full monthly price

### Requirement: A suspended pod bills a flat low rate

A suspended pod SHALL bill a flat $1/month regardless of size, reflecting that suspension releases its
compute AND archives its disk off the box (see sandbox-provider). A pod SHALL bill its running price
only while running and the flat suspended rate only while suspended.

#### Scenario: Suspending drops the pod to the suspended rate

- **WHEN** an owner suspends a running pod
- **THEN** the pod SHALL stop accruing its running price and begin accruing the flat suspended rate,
  and resuming it SHALL return it to its running price

### Requirement: A new account receives a signup credit, gated by a card on file

A new account SHALL receive an account credit (in the $12–15 range) that is spendable against any
size's price, ONLY after a valid payment card is on file. Pods created purely against free credit
SHALL be capped to Mini–Medium sizes. There SHALL be no free-forever tier — the credit is the only
free entry, and it is finite.

#### Scenario: Credit is granted only with a card

- **WHEN** a new account adds a valid payment card
- **THEN** the signup credit SHALL be granted and SHALL offset subsequent pod charges until exhausted

#### Scenario: No card, no credit, no free tier

- **WHEN** a new account has not added a card
- **THEN** it SHALL NOT receive credit and SHALL NOT be able to run a pod for free by any other means

### Requirement: A referral grants credit to both sides after the referred account pays

A referral SHALL grant a credit to both the referrer and the referred account, but the referrer's
credit SHALL be granted ONLY after the referred account has kept a PAID (non-credit) pod for
approximately 30 days, and only when the two accounts present distinct identities/cards. This defers
the reward past the point where self-referral or throwaway abuse would pay off.

#### Scenario: Referral credit is deferred until the referred account is genuinely paying

- **WHEN** a referred account signs up and runs a pod
- **THEN** the referrer's credit SHALL NOT be granted until that account has maintained a paid pod for
  ~30 days on a distinct payment identity; before that threshold no referral credit SHALL be issued
