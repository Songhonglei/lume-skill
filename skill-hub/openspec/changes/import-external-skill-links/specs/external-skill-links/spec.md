## ADDED Requirements

### Requirement: Publish a skill from an external URL
The publish form SHALL accept a public GitHub, ClawHub, Tencent SkillHub, or Skills.sh skill URL and validate the resolved package before submission. The import SHALL use the normal skill publication and review rules and SHALL record the verified source for the version.

#### Scenario: No package at the source
- **WHEN** the address cannot resolve to exactly one eligible skill package
- **THEN** the form reports an error without creating a skill version

#### Scenario: Source changes before submission
- **WHEN** the content fetched for publication differs from the previewed package
- **THEN** publication refuses the submission and asks the user to import the link again

### Requirement: Retire dedicated GitHub workflows
The web application SHALL consolidate skills in the general catalog and remove dedicated GitHub collection, repository settings, and management entry points. Existing records and authorized downloads SHALL remain available through the normal product workflows.
