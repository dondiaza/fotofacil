export function driveFolderLink(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function driveFilePreviewLink(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function driveFileThumbLink(fileId: string) {
  return `https://drive.google.com/thumbnail?id=${fileId}`;
}
