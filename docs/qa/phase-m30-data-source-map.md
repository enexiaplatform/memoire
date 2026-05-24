# Phase M.30 Data Source Map

Memoire currently uses localStorage fallback plus Supabase cloud tables when Google Auth and Supabase configuration are available.

## Sales Activities

- Module routes: `/app/capture`, `/app/calendar`, `/app/reviews`, `/app/dashboard`, `/app/accounts`, `/app/opportunities`
- Service: `src/services/salesActivityStore.ts`
- Local key: `memoire.salesActivities.v1`
- Supabase table: `public.sales_activities`
- Primary app fields:
  - `activityDate`
  - `rawNote`
  - `activityType`
  - `accountName`
  - `opportunityName`
  - `summary`
  - `nextAction`
  - `dueDate`
  - `tags`
  - `linkedOpportunityId`
  - `linkedOpportunityName`
  - `linkedAccountName`
  - `linkStatus`
  - `createdAt`
  - `updatedAt`
- Cloud mapping examples:
  - `activityDate` -> `activity_date`
  - `rawNote` -> `raw_note`
  - `linkedOpportunityId` -> `linked_opportunity_id`
  - `linkedAccountName` -> `linked_account_name`
  - `linkStatus` -> `link_status`

## Opportunities

- Module routes: `/app/opportunities`, `/app/dashboard`, `/app/accounts`, `/app/pipeline-defense`
- Service: `src/services/opportunityStore.ts`
- Local key: `memoire.opportunities.v1`
- Supabase table: `public.opportunities`
- Primary app fields:
  - `accountName`
  - `opportunityName`
  - `stage`
  - `estimatedValue`
  - `currency`
  - `expectedClosePeriod`
  - `productOrSolution`
  - `decisionMaker`
  - `budgetOwner`
  - `procurementPath`
  - `technicalCriteria`
  - `nextAction`
  - `nextActionDate`
  - `evidence`
  - `missingContext`
  - `objectionDebt`
  - `forecastEvidenceCategory`
  - `decisionRecommendation`
  - `status`
  - `createdAt`
  - `updatedAt`
- Cloud mapping examples:
  - `accountName` -> `account_name`
  - `opportunityName` -> `opportunity_name`
  - `estimatedValue` -> `estimated_value`
  - `nextActionDate` -> `next_action_date`

## Accounts

- Module routes: `/app/accounts`, `/app/dashboard`, `/app/opportunities`, `/app/calendar`
- Service: `src/services/accountStore.ts`
- Local key: `memoire.accounts.v1`
- Supabase table: `public.accounts`
- Primary app fields:
  - `accountName`
  - `segment`
  - `industry`
  - `location`
  - `accountPotential`
  - `relationshipStatus`
  - `keyStakeholders`
  - `notes`
  - `tags`
  - `createdAt`
  - `updatedAt`
- Cloud mapping examples:
  - `accountName` -> `account_name`
  - `accountPotential` -> `account_potential`
  - `relationshipStatus` -> `relationship_status`
  - `keyStakeholders` -> `key_stakeholders`

## Pipeline Defense Briefs

- Module routes: `/app/pipeline-defense`, `/app/opportunities`, `/app/dashboard`
- Local utility: `src/utils/pipelineDefenseStorage.ts`
- Cloud service: `src/services/pipelineDefenseCloudStore.ts`
- Local key: `memoire.pipelineDefenseBriefs.v1`
- Legacy local key: `memoire.pipelineDefenseBrief.v1`
- Supabase table: `public.pipeline_defense_briefs`
- Primary app fields:
  - `title`
  - `weekLabel`
  - `salesOwner`
  - `scope`
  - `deals`
  - `createdAt`
  - `updatedAt`
- Cloud mapping examples:
  - `weekLabel` -> `week_label`
  - `salesOwner` -> `sales_owner`
  - `createdAt` -> `created_at`
  - `updatedAt` -> `updated_at`

## Onboarding State

- Module route: `/app/dashboard`
- Utility: `src/utils/onboardingState.ts`
- Local key: `memoire.onboarding.v1`
- Cloud table: none
- Persistence mode: local browser only
- Fields:
  - `hasSeenWelcome`
  - `hasCompletedFirstCapture`
  - `hasCreatedFirstOpportunity`
  - `hasCreatedFirstAccount`
  - `hasGeneratedFirstDefenseBrief`
  - `dismissedAt`
  - `updatedAt`

## Sample Data

- Entry point: Dashboard onboarding panel
- Storage behavior: local browser only
- Keys written:
  - `memoire.salesActivities.v1`
  - `memoire.opportunities.v1`
  - `memoire.accounts.v1`
  - `memoire.pipelineDefenseBriefs.v1`
- Cloud behavior: does not write to Supabase, even when signed in.
