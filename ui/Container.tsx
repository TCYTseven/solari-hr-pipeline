import type { ComponentProps } from "react";
import { cx } from "./cx";

/** 1200px max content width with the page gutter. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("mx-auto w-full max-w-content px-4 md:px-8", className)} {...props} />;
}
