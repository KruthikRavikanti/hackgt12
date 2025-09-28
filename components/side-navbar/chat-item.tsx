"use client";

import Link from "next/link";
import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSupabase } from "@/lib/supabase";
import { deleteChat } from "@/lib/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { toast } from "react-hot-toast";

type ChatItemProps = {
  selected: boolean;
  id: string;
  title: string;
};

export const ChatItem = ({ id, title, selected }: ChatItemProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { supabase, session } = useSupabase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams();
  const userId = session?.user.id;

  const deleteChatMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("User not authenticated");
      return await deleteChat(supabase, id, userId);
    },
    onSuccess: () => {
      // Invalidate and refetch chats
      queryClient.invalidateQueries({ queryKey: ["chats", userId] });

      // If we're currently viewing the deleted chat, redirect to home
      if (params.id === id) {
        router.push("/");
      }

      toast.success("Chat deleted successfully");
    },
    onError: (error) => {
      console.error("Error deleting chat:", error);
      toast.error("Failed to delete chat");
    },
  });

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation(); // Stop event bubbling
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    deleteChatMutation.mutate();
    setShowDeleteDialog(false);
  };

  return (
    <>
      <Link href={`/chat/${id}`}>
        <div
          className={`text-white group cursor-pointer flex items-center gap-2 justify-between px-2 py-1 rounded-md w-full ${
            selected ? "bg-[#5a6d81] text-white" : "bg-transparent"
          } hover:bg-[#4e5456]`}
        >
          <span className="flex-1 truncate text-sm">{title}</span>

          <Button
            className="invisible group-hover:visible w-fit h-fit p-1 hover:bg-red-600 hover:text-white"
            variant="ghost"
            size="icon"
            onClick={handleDeleteClick}
            disabled={deleteChatMutation.isPending}
          >
            <Trash2Icon className="w-3 h-3" />
          </Button>
        </div>
      </Link>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};