# Testing Resumable Upload Feature (断点续传功能测试)

## Overview
This document provides instructions for testing the newly implemented resumable upload feature.

## Feature Description
The resumable upload feature allows users to continue uploading files that were interrupted due to network issues, browser crashes, or manual interruption.

### How It Works
1. When you start uploading a file, the system creates an upload session identified by filename and your IP address
2. If the upload is interrupted, the system keeps track of how many chunks were successfully uploaded
3. When you select the same file again and click Upload, the system automatically resumes from the last uploaded chunk
4. Files in the "uploading" state are visible in the file list with their progress

## Testing Instructions

### Test Case 1: Basic Upload Resume
1. **Start an upload:**
   - Open the FileShare application in your browser
   - Select a large file (> 50MB recommended for easier testing)
   - Click "Upload" button
   
2. **Interrupt the upload:**
   - While the upload is in progress, close the browser tab or refresh the page
   
3. **Resume the upload:**
   - Reopen the FileShare application
   - Click "Refresh file list" button
   - You should see your file listed with status "(上传中)" and chunk progress
   - Click the "Resume" button to see instructions
   - Select the same file again and click "Upload"
   - The upload should continue from where it left off (not start from beginning)

### Test Case 2: Multiple Interrupted Uploads
1. **Start multiple uploads:**
   - Select and upload file A (interrupt after a few seconds)
   - Select and upload file B (interrupt after a few seconds)
   
2. **Verify file list:**
   - Refresh the file list
   - Both files should appear with "(上传中)" status
   - Each file should show its chunk count
   
3. **Resume specific file:**
   - Select file A and click Upload
   - Only file A's upload should resume
   - File B should remain in interrupted state

### Test Case 3: Complete Upload After Resume
1. **Start and interrupt upload:**
   - Upload a file and interrupt it
   
2. **Resume and complete:**
   - Refresh page and verify file shows as uploading
   - Select the same file and click Upload
   - Let the upload complete without interruption
   
3. **Verify completion:**
   - After completion, refresh the file list
   - The file should no longer show "(上传中)" status
   - The "Resume" button should be replaced with "Download" button
   - Download the file and verify it's complete and not corrupted

### Test Case 4: Different User Cannot Resume
1. **Start upload from one IP/browser:**
   - Upload a file and interrupt it
   
2. **Try to resume from different IP/browser:**
   - Open FileShare from a different device or incognito window
   - Try to upload a file with the same name
   - It should start a new upload (not resume the old one)

### Test Case 5: Chunk Count Accuracy
1. **Start upload with known chunk size:**
   - Set chunk size to 1MB
   - Upload a 10MB file
   - Interrupt after 30% progress
   
2. **Verify chunk count:**
   - Refresh file list
   - The displayed chunk count should be approximately 3 chunks
   
3. **Resume and verify:**
   - Resume the upload
   - Total chunks uploaded should be approximately 10

## Expected Behavior
- ✅ Files interrupted during upload remain in the list with "(上传中)" status
- ✅ Chunk count and file size are displayed for uploading files
- ✅ Selecting the same file again resumes from the last chunk
- ✅ Progress bar accurately reflects resume point
- ✅ Completed files can be downloaded and are not corrupted
- ✅ Different users/IPs cannot resume each other's uploads

## Known Limitations
1. **Manual File Selection Required:** Due to browser security restrictions, users must manually select the file again to resume. The browser cannot automatically access previously selected files.

2. **Same Filename Matching:** Resume detection is based on exact filename match. Renaming the file will create a new upload.

3. **IP-Based Isolation:** Uploads are tied to the user's IP address. If your IP changes (e.g., switching networks), you won't be able to resume the previous upload.

4. **Performance with Many Files:** The current implementation scans all files on each upload start. With a very large number of files (thousands), there may be a slight delay.

## Troubleshooting

### Upload doesn't resume
- Verify you selected the exact same file (same name)
- Check that you're on the same network/IP
- Ensure the file still shows as "(上传中)" in the file list

### Chunk count seems wrong
- This can happen if you changed the chunk size setting between uploads
- Delete the interrupted upload and start fresh with consistent settings

### File corrupted after resume
- Ensure you didn't modify the file between uploads
- Try deleting and re-uploading the entire file

## Performance Notes
- Larger chunk sizes (8-16MB) work better for large files and reduce overhead
- Smaller chunk sizes (1-4MB) are better for unreliable connections as less data is lost per interruption
