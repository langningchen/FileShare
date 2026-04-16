import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  InputAdornment,
  Link,
  Divider,
} from '@mui/material';
import {
  Upload as UploadIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';

const req = async (url, body = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.headers.get('Content-Type')?.includes('application/json')) {
    const json = await res.json();
    if (!json.Succeeded) {
      throw new Error(json.Message);
    }
    return json.Data;
  }
  const contentLengthHeader = res.headers.get('Content-Length');
  const parsedLength = contentLengthHeader != null ? parseInt(contentLengthHeader, 10) : null;
  const length = Number.isFinite(parsedLength) ? parsedLength : null;
  return { reader: res.body.getReader(), length };
};

const formatSize = (size) => {
  if (size < 1024) return size + 'B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(2) + 'KB';
  if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(2) + 'MB';
  return (size / 1024 / 1024 / 1024).toFixed(2) + 'GB';
};

function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [chunkSize, setChunkSize] = useState(8);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, file: null });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const refreshFileList = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await req('list');
      setFiles(res.files || []);
    } catch (error) {
      showSnackbar('刷新文件列表失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedChunkSize = localStorage.getItem('upChunkSize');
    if (savedChunkSize) {
      setChunkSize(parseInt(savedChunkSize));
    }
    refreshFileList();
  }, [refreshFileList]);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file || null);
  };

  const handleChunkSizeChange = (event) => {
    const value = parseInt(event.target.value);
    setChunkSize(value);
    localStorage.setItem('upChunkSize', value.toString());
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showSnackbar('请选择文件', 'warning');
      return;
    }
    if (chunkSize <= 0 || chunkSize > 50 || isNaN(chunkSize)) {
      showSnackbar('请设置有效的上传块大小（1-50MB）', 'warning');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      await new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64Data = reader.result.split(',')[1];
            const chunkSizeBytes = chunkSize * 1024 * 1024;
            const chunkCount = Math.ceil(base64Data.length / chunkSizeBytes);

            const response = await req('start', { filename: selectedFile.name });
            const fileId = response.fileId;
            let startChunk = response.chunks || 0;

            for (let i = startChunk; i < chunkCount; i++) {
              setUploadProgress(((i + 1) / chunkCount) * 100);
              await req('chunk', {
                fileId,
                content: base64Data.slice(i * chunkSizeBytes, (i + 1) * chunkSizeBytes),
              });
            }

            await req('end', { fileId });
            setUploadProgress(100);
            showSnackbar('上传成功！', 'success');
            setSelectedFile(null);
            document.getElementById('file-input').value = '';
            refreshFileList();
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('读取文件失败'));
      });
    } catch (error) {
      showSnackbar('上传失败: ' + error.message, 'error');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const handleDownload = async (file) => {
    setDownloading(true);
    setDownloadProgress(0);

    try {
      const chunks = [];
      for (let chunk = 0; chunk < file.chunks; chunk++) {
        setDownloadProgress((chunk / file.chunks) * 100);
        const { reader, length } = await req('download', { fileId: file.fileId, chunk });
        let readLength = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          readLength += value.length;
          if (length) {
            setDownloadProgress(((chunk + readLength / length) / file.chunks) * 100);
          }
          chunks.push(value);
        }
      }

      setDownloadProgress(100);
      const fileData = new Blob(chunks);
      const downLink = URL.createObjectURL(fileData);
      const downElement = document.createElement('a');
      downElement.href = downLink;
      downElement.download = file.filename;
      downElement.click();
      URL.revokeObjectURL(downLink);
      showSnackbar('下载成功', 'success');
    } catch (error) {
      showSnackbar('下载失败: ' + error.message, 'error');
    } finally {
      setDownloading(false);
      setTimeout(() => setDownloadProgress(0), 1000);
    }
  };

  const handleDeleteConfirm = async () => {
    const file = deleteDialog.file;
    setDeleteDialog({ open: false, file: null });

    try {
      await req('delete', { fileId: file.fileId });
      showSnackbar('删除成功', 'success');
      refreshFileList();
    } catch (error) {
      showSnackbar('删除失败: ' + error.message, 'error');
    }
  };

  const showSnackbar = (message, severity) => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h4" component="h1" color="primary" gutterBottom>
            File Share
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary" paragraph>
            This project is created by{' '}
            <Link href="https://github.com/langningchen" target="_blank" rel="noopener">
              Langning Chen
            </Link>{' '}
            for learning and communication purposes only. It is open sourced on{' '}
            <Link href="https://github.com/langningchen/FileShare" target="_blank" rel="noopener">
              GitHub
            </Link>{' '}
            and licensed under{' '}
            <Link href="https://github.com/langningchen/FileShare/blob/main/LICENSE" target="_blank" rel="noopener">
              GPL-3.0
            </Link>
            .
          </Typography>

          <Box sx={{ mb: 2 }}>
            <input
              accept="*/*"
              style={{ display: 'none' }}
              id="file-input"
              type="file"
              onChange={handleFileSelect}
            />
            <label htmlFor="file-input">
              <Button
                variant="outlined"
                component="span"
                fullWidth
                sx={{ mb: 2, py: 2, justifyContent: 'flex-start' }}
              >
                {selectedFile ? selectedFile.name : '点击选择文件'}
              </Button>
            </label>

            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                label="上传块大小"
                type="number"
                value={chunkSize}
                onChange={handleChunkSizeChange}
                inputProps={{ min: 1, max: 50 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">MB</InputAdornment>,
                }}
                sx={{ flex: '1 1 200px' }}
              />
              <Button
                variant="contained"
                startIcon={<UploadIcon />}
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                sx={{ flex: '0 0 auto' }}
              >
                上传
              </Button>
            </Box>

            {uploadProgress > 0 && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 0.5 }}>
                  {uploadProgress.toFixed(2)}%
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h2">
              文件列表
            </Typography>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={refreshFileList}
              disabled={loading}
            >
              刷新
            </Button>
          </Box>

          {downloadProgress > 0 && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress variant="determinate" value={downloadProgress} />
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 0.5 }}>
                {downloadProgress.toFixed(2)}%
              </Typography>
            </Box>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>文件名</TableCell>
                    <TableCell>文件大小</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {files.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography variant="body2" color="text.secondary">
                          暂无文件
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    files.map((file) => (
                      <TableRow key={file.fileId} hover>
                        <TableCell>
                          {file.filename}
                          {file.uploading && (
                            <Typography component="span" variant="body2" color="text.secondary">
                              {' '}
                              (上传中)
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {file.size !== undefined ? (
                            <>
                              {formatSize(file.size)}
                              {file.uploading && (
                                <Typography component="span" variant="body2" color="text.secondary">
                                  {' '}
                                  ({file.chunks} 块已上传)
                                </Typography>
                              )}
                            </>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            {file.chunks && !file.uploading && (
                              <Button
                                variant="contained"
                                size="small"
                                startIcon={<DownloadIcon />}
                                onClick={() => handleDownload(file)}
                                disabled={downloading}
                              >
                                下载
                              </Button>
                            )}
                            {file.uploading && (
                              <Button
                                variant="contained"
                                color="success"
                                size="small"
                                startIcon={<PlayArrowIcon />}
                                onClick={() =>
                                  showSnackbar(
                                    `要继续上传 "${file.filename}"，请选择相同的文件并点击上传。上传将从第 ${file.chunks} 块继续。`,
                                    'info'
                                  )
                                }
                              >
                                继续
                              </Button>
                            )}
                            {file.admin && (
                              <Button
                                variant="contained"
                                color="error"
                                size="small"
                                startIcon={<DeleteIcon />}
                                onClick={() => setDeleteDialog({ open: true, file })}
                              >
                                删除
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, file: null })}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除文件 "{deleteDialog.file?.filename}" 吗？此操作无法撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, file: null })}>取消</Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default App;
