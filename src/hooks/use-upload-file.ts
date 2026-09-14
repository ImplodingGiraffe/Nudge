import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { saveMediaFile } from '@/lib/media-storage';

export type UploadedFile<T = unknown> = {
  key: string;
  appUrl: string;
  name: string;
  size: number;
  type: string;
  url: string;
  customId: string | null;
  serverData: T | null;
  ufsUrl: string;
  fileHash: string;
};

export interface UseUploadFileProps {
  onUploadComplete?: (file: UploadedFile) => void;
  onUploadError?: (error: unknown) => void;
  headers?: Record<string, string>;
  onUploadBegin?: (fileName: string) => void;
  onUploadProgress?: (progress: number) => void;
  skipPolling?: boolean;
}

export function useUploadFile({
  onUploadComplete,
  onUploadError,
}: UseUploadFileProps = {}) {
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
  const [uploadingFile, setUploadingFile] = React.useState<File>();
  const [progress, setProgress] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState(false);

  async function uploadThing(file: File) {
    setIsUploading(true);
    setUploadingFile(file);

    try {
      setProgress(40);
      const saved = await saveMediaFile(file);
      setProgress(100);

      const uploaded: UploadedFile = {
        key: saved.id,
        appUrl: saved.url,
        name: file.name,
        size: file.size,
        type: file.type,
        url: saved.url,
        customId: null,
        serverData: null,
        ufsUrl: saved.url,
        fileHash: saved.id,
      };

      setUploadedFile(uploaded);
      onUploadComplete?.(uploaded);
      return uploaded;
    } catch (error) {
      console.error('Failed to save media file locally:', error);
      toast.error('Failed to save media file');
      onUploadError?.(error);
      return undefined;
    } finally {
      setProgress(0);
      setIsUploading(false);
      setUploadingFile(undefined);
    }
  }

  return {
    isUploading,
    progress,
    uploadedFile,
    uploadFile: uploadThing,
    uploadingFile,
  };
}

export function getErrorMessage(err: unknown) {
  const unknownError = 'Something went wrong, please try again later.';

  if (err instanceof z.ZodError) {
    const errors = err.issues.map((issue) => issue.message);

    return errors.join('\n');
  }
  if (err instanceof Error) {
    return err.message;
  }
  return unknownError;
}

export function showErrorToast(err: unknown) {
  const errorMessage = getErrorMessage(err);

  return toast.error(errorMessage);
}