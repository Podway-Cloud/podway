## ADDED Requirements

### Requirement: The size step offers the full ladder, defaults to Medium, and shows price

The Basics size step SHALL offer all five sizes — Mini, Small, Medium, Large, XL — and SHALL default
to **Medium** (the smallest size that runs the prebuilt stack: a Next build plus in-pod Postgres).
Mini SHALL be presented as a light option (bots, static, small scripts), never the default. On the
cloud edition each size SHALL display its **flat monthly price** next to its machine specs (vCPU, RAM,
disk); there SHALL be no "slot" language anywhere in the flow.

#### Scenario: Default and options

- **WHEN** an owner opens the launch flow without choosing a size
- **THEN** the pre-selected size SHALL be Medium, and all five sizes SHALL be selectable with their
  vCPU/RAM/disk specs shown

#### Scenario: Price is shown with the specs on cloud

- **WHEN** an owner views the size options on the cloud edition
- **THEN** each size SHALL show its flat monthly price alongside its specs, and the Review step SHALL
  carry that price through to launch; self-host SHALL show specs without a price
