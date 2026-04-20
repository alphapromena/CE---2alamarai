import { Skeleton } from '@/components/ui/skeleton';

export default function AuthLoading() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-6 py-12">
      <div className="w-full space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-4 h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}
