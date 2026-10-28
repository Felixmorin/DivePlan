import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Authenticated pages opt in to speculative work rather than prefetching every visible row. */
export default function AppLink(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
