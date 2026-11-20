import { Suspense } from "react";
import ChartView from "@/components/ChartView";
import { Spinner } from "@/components/ui";

export default function ChartPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ChartView />
    </Suspense>
  );
}
