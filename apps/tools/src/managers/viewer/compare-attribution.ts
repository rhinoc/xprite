enum CompareCampaign {
  AsepriteOnline = "aseprite-online",
  AsepriteOnIpad = "aseprite-on-ipad",
  PiskelAlternatives = "piskel-alternatives",
}

const COMPARE_SOURCE = "compare";
const COMPARE_MEDIUM = "referral";
const COMPARE_CAMPAIGNS = new Set<string>(Object.values(CompareCampaign));

/** Keep only the fixed comparison attribution when continuing into the editor. */
export function viewerCompareSearch(search: string): string {
  const parameters = new URLSearchParams(search);
  const campaign = parameters.get("utm_campaign");
  if (
    parameters.get("utm_source") !== COMPARE_SOURCE ||
    parameters.get("utm_medium") !== COMPARE_MEDIUM ||
    !campaign ||
    !COMPARE_CAMPAIGNS.has(campaign)
  )
    return "";
  return `?utm_source=${COMPARE_SOURCE}&utm_medium=${COMPARE_MEDIUM}&utm_campaign=${campaign}`;
}
