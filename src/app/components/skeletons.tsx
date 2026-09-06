/** Loading placeholders used by each route's loading.tsx (a real Suspense boundary Next shows
 * while the server component fetches — not a fake timer, so it reflects actual latency). */

export function Skel({ w, h, r = 6 }: { w: string | number; h: number; r?: number }) {
  return <div className="rl-skel" style={{ width: w, height: h, borderRadius: r, flex: "none" }} />;
}

export function BoardSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", gap: 16, padding: 20, overflow: "hidden" }}>
      {[0, 1, 2, 3].map((c) => (
        <div key={c} style={{ width: 280, flex: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <Skel w={90} h={14} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <Skel w={60} h={16} r={999} />
                <Skel w="80%" h={14} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Skel w={50} h={16} r={999} />
                  <Skel w={40} h={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div style={{ flex: 1, overflow: "hidden", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: 10 }}>
          <Skel w={28} h={28} r={999} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Skel w={100} h={12} />
            <Skel w={220} h={13} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ManageSkeleton() {
  return (
    <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <Skel w={160} h={18} />
      <Skel w="100%" h={60} r={10} />
      <Skel w="100%" h={60} r={10} />
      <Skel w="100%" h={60} r={10} />
    </div>
  );
}
