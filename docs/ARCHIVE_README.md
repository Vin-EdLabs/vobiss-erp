# VOBISS Archive

The Archive is VOBISS's authenticated document library for storing historical and operational files in named folders. It is available at:

- `/archive`

Archive access is available to staff accounts only. Customer portal accounts cannot use the Archive.

## Folder Scopes

Every folder has one of these scopes:

- **Global**: visible to all staff users.
- **Unit**: visible to users assigned to the selected unit.
- **Private**: visible only to the user who created it, including when the viewer is an administrator or director.

Supported unit folders include NOC, IP, TS, Project, Design, Sales, Finance, Procurement, CX, and HR.

Folder names must be unique within their scope. Private-folder name uniqueness is per owner.

## Creating A Folder

1. Open `/archive`.
2. Select **New Folder**.
3. Enter a folder name and optional description.
4. Select `Global`, `Unit`, or `Private`.
5. Select a unit when creating a unit folder.
6. Create the folder.

Staff can create private folders and global folders. A user can create a unit folder only for a unit they belong to. Directors and system administrators can create folders in any supported scope.

## Uploading Files

1. Select a folder.
2. Click **Upload**, or drag files into the file area.
3. Multiple files can be uploaded at once.

The maximum upload is 10 files per request and 30 MB per file. Allowed extensions are:

- PDF, XLS, XLSX, CSV
- DOC, DOCX
- KMZ, KML
- PNG, JPG, JPEG, GIF, WEBP
- ZIP

Files are recorded with their original name, display name, type, extension, size, uploader, and upload time.

## Finding Files

- Search folders by folder name.
- Filter folders by all available, global, the user's units, or private folders.
- Open a folder to search its files by display name.
- Files are shown newest first.
- File lists are paginated.

## Preview And Download

- PDF and image files can be previewed in the Archive interface.
- Other supported file types can be downloaded.
- Downloads and previews require an authenticated session and folder permission.
- Archive files are stored outside the public `/uploads` directory. They are never exposed through an unauthenticated static URL.

## Editing And Deleting

### Folders

- A folder creator can rename or delete their folder where permitted.
- Unit managers and supervisors can manage folders belonging to their unit.
- Directors and system administrators can manage non-private folders.
- Private folders can be managed only by their creator.
- Non-admin users must delete all files before deleting a folder.
- An administrator can delete a folder containing files; its files are removed with the folder.

### Files

- The uploader can rename or delete their file.
- Unit managers and supervisors can manage files in their unit folder.
- Directors and system administrators can manage non-private files.
- A file can be moved only to another folder with the same scope and unit.
- Private files remain private after a move.

## Security And Permissions

Archive permission is checked on every folder and file operation:

- Listing folders
- Listing files
- Uploading
- Renaming or moving
- Deleting
- Previewing
- Downloading

A private folder has no administrator bypass. Only its owner can see or manage it. Unit folders are restricted to the relevant unit unless the user has an administrative or executive archive role.

Archive actions are recorded in the activity log, including folder creation, folder deletion, file upload, and file deletion.

## API Reference

All endpoints require a staff JWT in the `Authorization: Bearer <token>` header. The backend mount is `/api/archive`.

- `GET /api/archive/units` - list units available for folder creation.
- `GET /api/archive/folders` - list accessible folders. Supports `scope`, `unitSlug`, `q`, `page`, and `limit`.
- `POST /api/archive/folders` - create a folder.
- `PATCH /api/archive/folders/:id` - rename or update a folder description.
- `DELETE /api/archive/folders/:id` - delete a folder.
- `GET /api/archive/folders/:folderId/files` - list files in an accessible folder. Supports `q`, `page`, and `limit`.
- `POST /api/archive/folders/:folderId/files` - upload one or more files using multipart field `files`.
- `PATCH /api/archive/files/:id` - rename a file or move it within the same scope.
- `DELETE /api/archive/files/:id` - delete a file.
- `GET /api/archive/files/:id/preview` - stream a previewable PDF or image.
- `GET /api/archive/files/:id/download` - stream a file download.

## Storage And Database

- Files are stored locally under `backend/archive-storage`.
- Archive files are not served by the public static upload mount.
- Folder metadata is stored in `archive_folders`.
- File metadata is stored in `archive_files`.
- The archive tables and required indexes are initialized automatically when the archive routes are first used.
- Deleting a folder cascades its database file records; the backend also removes the stored file when a file is deleted directly.

## Troubleshooting

**Archive is not visible**

Check that the account is a staff account and that the user is not signed in through the customer portal.

**A folder is missing**

Check the folder scope. Unit folders require membership in that unit, and private folders are visible only to their owner.

**Upload is rejected**

Check the file extension, file size, and the number of files in the upload request.

**A file cannot be previewed**

Only PDF and image files support preview. Download the file instead.

**A folder cannot be deleted**

Non-admin users must remove its files first. Also verify that the user owns the folder or manages its unit.

## Implementation Map

- Frontend page: `src/pages/Archive.tsx`
- Frontend API client: `src/api/archive.ts`
- Frontend archive components: `src/components/archive/`
- Backend routes: `backend/routes/archive.js`
- Archive service and permissions: `backend/services/archive.js`
- Storage directory: `backend/archive-storage/`
- Frontend route: `/archive`
- Backend route mount: `/api/archive`
