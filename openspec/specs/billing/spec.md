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
