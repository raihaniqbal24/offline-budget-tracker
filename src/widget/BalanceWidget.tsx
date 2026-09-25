import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { ISODate } from "../lib/dates";
import { widgetView, type WidgetSummary } from "./summary";

/**
 * The home screen widget (FR-14.1). Read-only, resizable, and it opens the
 * app when tapped (FR-14.5).
 *
 * Two constraints shape this layout. Widget styles take no percentage
 * widths, so the progress bar is drawn as ten fixed segments rather than a
 * proportional fill. And a widget cell clips rather than scrolls, so every
 * line is capped to one line and truncated, which stops a long amount from
 * pushing the layout past the right edge.
 */
const LIGHT = {
  background: "#FFFFFF",
  text: "#12241F",
  muted: "#6B7B76",
  primary: "#0E6B57",
  track: "#E6EFEC",
  warn: "#D9822B",
  over: "#B3261E",
} as const;

const SEGMENTS = 10;
const SEGMENT_WIDTH = 10;
const SEGMENT_GAP = 3;

/** How many of the ten blocks are filled: anything above zero lights at least one. */
export function filledSegments(percent: number): number {
  if (percent <= 0) return 0;
  return Math.min(SEGMENTS, Math.max(1, Math.round((percent / 100) * SEGMENTS)));
}

export function BalanceWidget({ summary, todayDate }: { summary: WidgetSummary; todayDate: ISODate }) {
  const view = widgetView(summary, todayDate);
  const theme = LIGHT;
  const filled = view.percent === null ? 0 : filledSegments(view.percent);
  const fillColour =
    view.percent !== null && view.percent >= 100
      ? theme.over
      : view.percent !== null && view.percent >= 75
        ? theme.warn
        : theme.primary;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: theme.background,
        borderRadius: 24,
      }}
    >
      <TextWidget
        text={view.balanceLabel}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 12, color: theme.muted, width: "match_parent" }}
      />
      <TextWidget
        text={view.balanceText}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 22, fontWeight: "700", color: theme.text, width: "match_parent" }}
      />

      <FlexWidget style={{ height: 10, width: "match_parent" }} />

      <TextWidget
        text={view.spentLabel}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 12, color: theme.muted, width: "match_parent" }}
      />
      <TextWidget
        text={view.noLimitText ?? view.spentText}
        maxLines={1}
        truncate="END"
        style={{
          fontSize: view.noLimitText ? 13 : 15,
          fontWeight: view.noLimitText ? "400" : "600",
          color: view.noLimitText ? theme.muted : theme.text,
          width: "match_parent",
        }}
      />

      {view.percent !== null ? (
        <FlexWidget
          style={{ flexDirection: "row", alignItems: "center", width: "wrap_content", marginTop: 7 }}
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <FlexWidget
              key={i}
              style={{
                width: SEGMENT_WIDTH,
                height: 8,
                borderRadius: 3,
                marginRight: i === SEGMENTS - 1 ? 0 : SEGMENT_GAP,
                backgroundColor: i < filled ? fillColour : theme.track,
              }}
            />
          ))}
        </FlexWidget>
      ) : null}

      <TextWidget
        text={view.asOfText}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 10, color: theme.muted, marginTop: 8, width: "match_parent" }}
      />
    </FlexWidget>
  );
}
