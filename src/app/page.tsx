import type { Metadata } from "next";

import { Planner } from "@/components/planner";

export const metadata: Metadata = {
  title: "Föräldrapenning",
};

export default function Home() {
  return <Planner />;
}
