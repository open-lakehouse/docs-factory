import { useMutation } from "@connectrpc/connect-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { deleteContent } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { useReviewInvalidation } from "../../lib/review-queries";

export function NotOnDiskBadge() {
  return (
    <Badge variant="outline" title="The review DB has this entry, but this build has no such page">
      not on disk
    </Badge>
  );
}

/** Maintainer-only: hard-delete the review DB's record of a page removed from git. */
export function DeleteOrphanControl({
  contentRef,
  label,
}: {
  contentRef: ContentRef;
  label: string;
}) {
  const { isMaintainer } = useAuth();
  const { invalidateDrafts, invalidateComments, invalidateReviewRequests } =
    useReviewInvalidation();
  const [open, setOpen] = useState(false);
  const remove = useMutation(deleteContent, {
    onSuccess: () => {
      setOpen(false);
      void invalidateDrafts();
      void invalidateComments(contentRef);
      void invalidateReviewRequests();
    },
  });
  if (!isMaintainer) return null;
  return (
    <>
      <Button variant="destructive" size="xs" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) remove.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{label}” from the review app?</DialogTitle>
            <DialogDescription>
              This page is no longer in the repository. Deleting removes everything the review app
              holds for it: registered versions, comment threads, approvals, ratings, review
              requests, priority, and its timeline. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {remove.error && <p className="admin-error">{remove.error.message}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => void remove.mutateAsync({ ref: contentRef })}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
