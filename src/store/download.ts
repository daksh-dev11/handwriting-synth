export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') throw new Error('DOWNLOAD_UNAVAILABLE');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
