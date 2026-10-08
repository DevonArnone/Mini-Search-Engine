export default function Loading() {
  return (
    <main aria-busy="true" className="page min-h-[calc(100vh-var(--header-height))] pt-10 sm:pt-14" id="main-content">
      <p className="sr-only" role="status">Loading the page</p>
      <div className="skeleton h-12 w-72 max-w-full" />
      <div className="skeleton mt-4 h-5 w-full max-w-xl" />
      <div className="skeleton mt-2 h-5 w-4/5 max-w-lg" />
      <div className="mt-12 border-t border-rule-strong">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="border-b border-rule py-6" key={index}>
            <div className="skeleton h-6 w-1/3" />
            <div className="skeleton mt-3 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </main>
  );
}
