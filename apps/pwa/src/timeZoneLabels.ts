const GMT_OFFSET_LABEL = /\bGMT(?=$|[+-]\d{1,2}(?::\d{2})?)/g;

export function formatUtcTimeZoneLabel(label: string): string {
  return label.replace(/\u2212/g, "-").replace(GMT_OFFSET_LABEL, "UTC");
}

export function formatUtcTimeZoneText(text: string): string {
  return formatUtcTimeZoneLabel(text);
}
