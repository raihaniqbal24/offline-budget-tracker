/**
 * Android asks for the widget to be drawn here: when it is added, at the
 * system's own refresh interval, and after the app requests an update.
 * It only reads the stored summary (FR-14.8), so it never touches the
 * database and works with the app closed.
 */
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { today } from "../lib/dates";
import { readSummary } from "./storage";
import { BalanceWidget } from "./BalanceWidget";
import { emptySummary, WIDGET_NAME } from "./summary";

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
    case "WIDGET_CLICK": {
      const todayDate = today();
      const summary = (await readSummary()) ?? emptySummary("en", todayDate);
      props.renderWidget(
        <BalanceWidget summary={summary} todayDate={todayDate} />,
      );
      break;
    }
    case "WIDGET_DELETED":
    default:
      break; // nothing to clean up: the app keeps its own data (FR-14.9)
  }
}
