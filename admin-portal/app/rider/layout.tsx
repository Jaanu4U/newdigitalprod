import RiderNavBar from "@/components/RiderNavBar";

export default function RiderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <RiderNavBar />
      <main className="max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
