import {
  CompareCampaign,
  type TelemetryAttributionInput,
  type TelemetryProperties,
} from "$/managers/ports/telemetry";

const COMPARE_SOURCE = "compare";
const COMPARE_MEDIUM = "referral";
const COMPARE_CAMPAIGNS = new Set<string>(Object.values(CompareCampaign));

/** Only the published comparison routes can attribute the current page visit. */
export function compareAttributionContext(input: TelemetryAttributionInput): TelemetryProperties {
  if (
    input.source !== COMPARE_SOURCE ||
    input.medium !== COMPARE_MEDIUM ||
    !input.campaign ||
    !COMPARE_CAMPAIGNS.has(input.campaign)
  )
    return {};
  return {
    compare_source: COMPARE_SOURCE,
    compare_medium: COMPARE_MEDIUM,
    compare_campaign: input.campaign,
  };
}
