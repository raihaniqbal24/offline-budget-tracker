import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import type { ISODate } from "../lib/dates";
import { widgetView, type WidgetSummary } from "./summary";

/**
 * The home screen widget (FR-14.1). Read-only, one size, resizable, and it
 * opens the app when tapped (FR-14.5). Colours are literals rather than the
 * app's theme tokens because this renders outside React Native's styling;
 * phase 2 gives it a dark variant.
 */
const LIGHT = {
  background: "#FFFFFF",
  text: "#12241F",
  muted: "#6B7B76",
  primary: "#0E6B57",
  track: "#E6EFEC",
} as const;

/** A rounded track with the filled portion on top, in a 100x8 viewBox. */
function progressBarSvg(percent: number, track: string): string {
  const fill =
    percent >= 100 ? "#B3261E" : percent >= 75 ? "#D9822B" : LIGHT.primary;
  const width = Math.max(percent, 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 8" preserveAspectRatio="none">` +
    `<rect x="0" y="0" width="100" height="8" rx="4" fill="${track}"/>` +
    `<rect x="0" y="0" width="${width}" height="8" rx="4" fill="${fill}"/>` +
    `</svg>`
  );
}

export function BalanceWidget({
  summary,
  todayDate,
}: {
  summary: WidgetSummary;
  todayDate: ISODate;
}) {
  const view = widgetView(summary, todayDate);
  const theme = LIGHT;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: theme.background,
        borderRadius: 24,
      }}
    >
      <TextWidget
        text={view.balanceLabel}
        style={{ fontSize: 12, color: theme.muted }}
      />
      <TextWidget
        text={view.balanceText}
        style={{ fontSize: 24, fontWeight: "700", color: theme.text }}
      />

      <FlexWidget style={{ height: 12, width: "match_parent" }} />

      <TextWidget
        text={view.spentLabel}
        style={{ fontSize: 12, color: theme.muted }}
      />
      {view.noLimitText ? (
        <TextWidget
          text={view.noLimitText}
          style={{ fontSize: 13, color: theme.muted }}
        />
      ) : (
        <TextWidget
          text={view.spentText}
          style={{ fontSize: 15, fontWeight: "600", color: theme.text }}
        />
      )}

      {view.percent !== null ? (
        // Drawn as SVG: widget layouts take no percentage widths, and an SVG
        // scales with the widget when it is resized.
        <SvgWidget
          svg={progressBarSvg(view.percent, theme.track)}
          style={{ height: 8, width: "match_parent", marginTop: 6 }}
        />
      ) : null}

      <TextWidget
        text={view.asOfText}
        style={{ fontSize: 10, color: theme.muted, marginTop: 8 }}
      />
    </FlexWidget>
  );
}
