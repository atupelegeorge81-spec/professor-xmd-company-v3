import { Suspense } from "react";
import { BoardRoom } from "@/components/board/BoardRoom";

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <BoardRoom />
    </Suspense>
  );
}
