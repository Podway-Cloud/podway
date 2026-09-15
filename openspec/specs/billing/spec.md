# billing Specification

## Purpose

The cloud edition bills each pod at a flat monthly price (by size), grants free signup + referral
credit, and charges a saved card only once that credit runs out. This capability covers what the
owner SEES and CONTROLS about their billing: the billing page (a tabbed Overview / Invoices / Payment
method / Referral layout), card management, invoice history, credit visibility, referral status, and
the cost shown at pod-create time. Stripe is the system of record for cards, invoices, and the
customer balance; our `billing_accounts` / `credit_grants` tables mirror the has-card flag and the
credit ledger for fast reads. Billing is cloud-only and every surface degrades gracefully when Stripe
is not configured.

## Requirements

### Requirement: The billing page is a tabbed layout

The billing page SHALL present its content as four tabs — Overview, Invoices, Payment method, and
Referral — using the app's canonical tab component (the same `Tabs`/`TabsList`/`TabsTrigger`/
`TabsContent` primitive and line-variant styling the pod cockpit uses), so the tab strip looks and
behaves identically to the cockpit's. The page SHALL be a server component that fetches billing state
and passes it to a client tab view. The page SHALL be cloud-only and SHALL `notFound()` in the
self-host edition.

#### Scenario: Owner opens the billing page on cloud

- **WHEN** an approved owner opens `/dashboard/billing` on the cloud edition
- **THEN** a tabbed page renders with Overview, Invoices, Payment method, and Referral tabs, Overview
  selected first

#### Scenario: Self-host has no billing page

- **WHEN** the self-host edition serves `/dashboard/billing`
- **THEN** the route SHALL return not-found (no per-pod billing exists there)

### Requirement: Every billing surface degrades when Stripe is not configured

When Stripe is not configured (no active-mode secret key, i.e. `getBillingSummary()` returns null),
no billing surface SHALL throw or call Stripe. Each tab and the create-time cost card SHALL show a
"coming soon"/placeholder state, while surfaces backed by real non-Stripe data (the per-size monthly
pod costs) SHALL still render truthfully.

#### Scenario: Billing is off

- **WHEN** the billing page or the create Review step renders with Stripe unconfigured
- **THEN** the pod cost list still shows real per-size prices, and the Payment method, Invoices,
  Referral, and credit-history sections show placeholder copy with no card/invoice/Stripe read

### Requirement: Overview shows spend, credit, and next charge

The Overview tab SHALL show three compact tiles — the real monthly total for the owner's current
pods, the remaining credit (credit ledger balance / 100), and the next charge (its date from the
Stripe subscription's current period end, with an estimated amount after credit) — followed by the
per-pod monthly line items with a total, and a credit-history list of the owner's grants (signup +
referral) read from the `credit_grants` ledger. When the next-charge date cannot be read from Stripe,
the tile SHALL fall back to a friendly "when credit runs out" rather than showing a wrong date.

#### Scenario: Owner with credit and pods

- **WHEN** an owner with free credit and running pods opens Overview
- **THEN** the tiles show this-month total, credit left, and an estimated next charge; the pod list
  and total are shown; and the credit-history list shows each grant with its date and amount

### Requirement: Invoices link the receipt and show the amount paid

The Invoices tab SHALL list the owner's recent Stripe invoices, each linking to its hosted Stripe
receipt (`hosted_invoice_url`) when present, and SHALL display the amount actually PAID
(`amount_paid`, i.e. after credit) with the invoice status — not the pre-credit amount due.

#### Scenario: An invoice with credit applied

- **WHEN** an invoice was covered partly by credit
- **THEN** the row shows the amount paid (not the amount due) and links to the Stripe receipt

### Requirement: Owner can view, replace, and remove their card

The Payment method tab SHALL show the default card's brand, last four digits, and expiry (read from
Stripe), with actions to replace the card (the existing add-card SetupIntent flow) and to remove it.
Removing the card SHALL require a confirm (the app's `useConfirm` dialog) and SHALL detach the saved
card(s) from Stripe and clear the has-card mirror. When no card is on file, the tab SHALL instead
prompt to add one, stating the signup credit the owner gets when they do.

#### Scenario: Card on file

- **WHEN** the owner has a card on file and opens Payment method
- **THEN** the card brand, last4, and expiry are shown with Replace and Remove actions

#### Scenario: Removing the card

- **WHEN** the owner clicks Remove and confirms
- **THEN** the saved card is detached from Stripe, the has-card flag is cleared, and the tab returns
  to the add-a-card prompt

#### Scenario: No card on file

- **WHEN** the owner has no card and opens Payment method
- **THEN** the tab shows an "add a card — get free credit" prompt with the add-card action

### Requirement: Referral tab shows link and status

The Referral tab SHALL show the owner's referral link and a status line derived from real data:
`joined` (accounts whose first-touch `ref` names this owner), `earned` (matured referrer payouts
recorded in `credit_grants` with reason `referral_referrer:<id>`, with the summed amount), and
`pending` (joined minus earned).

#### Scenario: Owner with referrals

- **WHEN** an owner who has referred accounts opens Referral
- **THEN** the referral link is shown along with joined / pending / earned counts (and earned amount)

### Requirement: The create Review step shows cost against credit

On the cloud pod-create wizard's Review step, a cost card SHALL show the chosen size's monthly price,
the owner's credit, and the amount charged now (`$0.00` when credit covers the first month), with a
callout explaining that the credit covers roughly N months and the card is billed only when credit
runs out. When the owner has no card on file, the card SHALL instead prompt to add one to receive the
free signup credit. Self-host (no per-pod price) SHALL NOT show this card.

#### Scenario: Creating a pod with covering credit and a card

- **WHEN** an owner with a card and enough credit reaches Review
- **THEN** the cost card shows the size price, the credit, "Charged now: $0.00", and a callout that
  the credit covers ~N months

#### Scenario: Creating a pod with no card

- **WHEN** an owner with no card on file reaches Review on cloud
- **THEN** the cost card shows the size price and prompts to add a card to get the free credit

### Requirement: The signup-credit figure has a single source of truth

The advertised signup-credit dollar figure and the amount actually granted SHALL derive from one
constant (`SIGNUP_CREDIT_CENTS` in `@podway/shared`), so the marketing figure (`SIGNUP_CREDIT_USD`)
and the control-plane grant cannot drift apart.

#### Scenario: Changing the signup credit

- **WHEN** the shared `SIGNUP_CREDIT_CENTS` value changes
- **THEN** both the granted amount and every advertised "$N free" figure change together

### Requirement: Non-payment suspends only uncovered accounts

The cloud edition SHALL suspend an account's pods for non-payment ONLY when BOTH conditions hold:
the account has no working payment (no card on file, or its latest subscription invoice failed /
is past-due) AND its credit balance cannot cover the amount due (credit is zero, or less than the
monthly cost of its running pods). The credit balance counts credit from every source — signup,
referrals, and admin grants. An account with a working card, or with enough credit to cover its
bill, SHALL NOT be treated as delinquent and SHALL NOT have any pod suspended. Suspension SHALL be
at the level of the delinquent account: a paid or credit-covered account's pods are never affected
by another account's delinquency.

Non-payment suspension SHALL suspend (reversibly), never delete, a pod. This behavior is cloud-only;
under the self-host edition it SHALL NOT run.

#### Scenario: A paid account is never suspended

- **WHEN** an account has a valid card and its subscription invoices are paid
- **THEN** the account SHALL NOT be marked delinquent and none of its pods SHALL be suspended

#### Scenario: Credit covers the bill

- **WHEN** an account has no working card but its credit balance is at least the amount due
- **THEN** the account SHALL NOT be marked delinquent, and if credit later drops below the amount
  due the account SHALL become eligible

#### Scenario: No working payment and credit cannot cover

- **WHEN** an account has no card (or a failed card) AND its credit is less than the amount due
- **THEN** the account SHALL be marked delinquent and enter the grace period

#### Scenario: Admin grant during grace clears delinquency

- **WHEN** a delinquent account receives enough credit (including an admin grant) to cover the bill
- **THEN** the account SHALL no longer be delinquent, and any pod auto-suspended for non-payment
  SHALL be eligible to resume

#### Scenario: Self-host does not run non-payment suspension

- **WHEN** the self-host edition evaluates non-payment
- **THEN** no delinquency SHALL be recorded and no pod SHALL be suspended

### Requirement: A grace period with daily notice precedes suspension

Before suspending, the cloud edition SHALL give a delinquent account a grace period (7 days). On each
of those days it SHALL show a warning on the user's dashboard AND send the user an email asking them
to pay and warning that their pods will be suspended. Only after the account has been continuously
delinquent for the full grace period SHALL its pods be suspended. The daily email SHALL be sent at
most once per day (idempotent across a webhook-triggered start and the daily sweep). If the account
resolves its delinquency at any point during grace, the clock and warnings SHALL stop.

#### Scenario: Daily warning during grace

- **WHEN** an account is delinquent on a given day within the grace period
- **THEN** a dashboard warning SHALL be shown and one reminder email SHALL be sent that day

#### Scenario: Suspension only after the full grace period

- **WHEN** an account has been delinquent for fewer than the full grace-period days
- **THEN** its pods SHALL NOT yet be suspended

#### Scenario: Resolving during grace stops the clock

- **WHEN** a delinquent account pays or gains enough credit during the grace period
- **THEN** the grace clock SHALL stop and no suspension SHALL occur
