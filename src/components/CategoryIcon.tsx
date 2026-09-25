import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { useCategoryColor } from "../theme/ThemeProvider";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** A category's icon on a soft tint of its color. */
export default function CategoryIcon({
  icon,
  color,
  size = 40,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  // FR-15.5: the user's colour, lightened only as far as a dark card needs.
  const adjusted = useCategoryColor()(color);
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${adjusted}22`,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon as IconName}
        size={size * 0.5}
        color={adjusted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
});
