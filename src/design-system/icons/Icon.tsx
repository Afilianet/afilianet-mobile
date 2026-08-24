import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../theme";
import { iconPaths, type IconName } from "./paths";

export type { IconName };

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Renders one of the 24 official Afilianet icons. 24x24 source viewBox,
 * stroke-based, tinted via `color`. Defaults to textPrimary -- unlike the
 * web reference (which uses CSS `currentColor` to inherit text color),
 * react-native-svg has no such inheritance, so callers should pass `color`
 * explicitly whenever the icon sits next to non-default-colored text.
 */
export function Icon({ name, size = 24, color = colors.textPrimary, strokeWidth = 1.75 }: IconProps) {
  const shapes = iconPaths[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {shapes.map((shape, index) => {
        const common = {
          stroke: color,
          strokeWidth,
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
        };
        if (shape.type === "path") return <Path key={index} {...common} d={shape.d} />;
        if (shape.type === "circle") return <Circle key={index} {...common} cx={shape.cx} cy={shape.cy} r={shape.r} />;
        return (
          <Rect
            key={index}
            {...common}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={shape.rx}
            transform={shape.transform}
          />
        );
      })}
    </Svg>
  );
}
