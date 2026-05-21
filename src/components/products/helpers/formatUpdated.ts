import { formatDistanceToNowStrict } from "date-fns";

export function formatUpdated(updatedAt: string | Date): string {
  return `Updated ${formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })}`;
}
