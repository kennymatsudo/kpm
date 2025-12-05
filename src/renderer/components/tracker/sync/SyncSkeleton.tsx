/**
 * Loading skeleton components for sync UI.
 */

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-surface-3 rounded ${className}`} />
  );
}

/**
 * Skeleton for a single item row in the sync preview.
 */
export function SyncItemSkeleton() {
  return (
    <div className="p-3 bg-surface-2 rounded-lg flex items-center gap-2">
      <Skeleton className="w-16 h-5" /> {/* Issue key */}
      <Skeleton className="flex-1 h-5" /> {/* Title */}
    </div>
  );
}

/**
 * Skeleton for the conflict card.
 */
export function SyncConflictSkeleton() {
  return (
    <div className="rounded-xl shadow-sm overflow-hidden bg-surface-1">
      {/* Header */}
      <div className="px-3 py-2 bg-surface-2 flex items-center gap-2">
        <Skeleton className="w-16 h-5" />
        <Skeleton className="flex-1 h-5" />
      </div>
      {/* Field row */}
      <div>
        <div className="px-3 py-1 bg-surface-1">
          <Skeleton className="w-16 h-4" />
        </div>
        <div className="grid grid-cols-2 gap-px bg-surface-3">
          <div className="p-3 bg-surface-1">
            <Skeleton className="w-20 h-4 mb-2" />
            <Skeleton className="w-full h-12" />
          </div>
          <div className="p-3 bg-surface-1">
            <Skeleton className="w-20 h-4 mb-2" />
            <Skeleton className="w-full h-12" />
          </div>
        </div>
      </div>
      {/* Buttons */}
      <div className="px-3 py-2 bg-surface-2 flex gap-2">
        <Skeleton className="w-20 h-7" />
        <Skeleton className="w-20 h-7" />
      </div>
    </div>
  );
}

/**
 * Full skeleton for the sync review panel content.
 */
export function SyncReviewSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Stats header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-24 h-6" />
        <Skeleton className="w-24 h-6" />
        <Skeleton className="w-24 h-6" />
      </div>

      {/* New items section */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="w-32 h-5" />
        </div>
        <div className="space-y-2">
          <SyncItemSkeleton />
          <SyncItemSkeleton />
        </div>
      </section>

      {/* Updates section */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="w-28 h-5" />
        </div>
        <div className="space-y-2">
          <SyncItemSkeleton />
        </div>
      </section>

      {/* Conflicts section */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="w-24 h-5" />
        </div>
        <div className="space-y-3">
          <SyncConflictSkeleton />
        </div>
      </section>
    </div>
  );
}
